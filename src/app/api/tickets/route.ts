import { currentTcIds } from '@/lib/ids'
import { NextResponse, type NextRequest } from 'next/server'
import { authenticate, need } from '@/lib/ci-api'
import { isDryRun } from '@/lib/automation-server'
import { ListQuery, readQuery } from '@/lib/tickets-api'
import { BulkChange, BulkCreate, CHANGE_FIELDS, CREATE_FIELDS, TicketChange, TicketCreate, issuesOf, needsAssign, splitArea } from '@/lib/tickets-schema'
import { changeTicket, createTicket, isFailure, ticketsJson } from '@/lib/tickets-write'

/**
 * GET /api/tickets: tickets, newest change first. Filters: state (comma list or "open"), kind
 * (defect, test_mismatch, task), owner, accountable, created_by (names), area ("Zone · Page"),
 * sprint, severity, tc_id, defect_id, external_ref, updated_since (ISO time), limit (max 1000).
 */
export async function GET(request: NextRequest) {
  const caller = await authenticate(request)
  if (caller instanceof NextResponse) return caller
  const q = readQuery(ListQuery, request.nextUrl.searchParams)
  if (!q.success) return NextResponse.json({ error: 'Invalid query', issues: q.error.issues.slice(0, 10) }, { status: 400 })
  const f = q.data
  const db = caller.db

  let query = db.from('ticket_list').select('id', { count: 'exact' }).order('updated_at', { ascending: false }).order('key').limit(f.limit)
  if (f.state) query = query.in('state', f.state)
  if (f.tc_id?.length) query = query.in('tc_id', await currentTcIds(db, f.tc_id))
  if (f.defect_id?.length) query = query.in('defect_id', f.defect_id)
  if (f.severity) query = query.eq('severity', f.severity)
  if (f.kind) query = query.eq('kind', f.kind)
  if (f.updated_since) query = query.gte('updated_at', f.updated_since)
  if (f.sprint) {
    const { data: s } = await db.from('sprints').select('id').ilike('name', f.sprint).maybeSingle()
    if (!s) return NextResponse.json({ error: `No sprint ${f.sprint}` }, { status: 404 })
    query = query.eq('current_sprint_id', s.id)
  }
  if (f.area) {
    const a = splitArea(f.area)
    if (!a) return NextResponse.json({ error: 'area is "Zone · Page"' }, { status: 400 })
    query = query.ilike('zone', a.zone).ilike('page', a.page)
  }
  // Fields the list view does not carry: narrowed on the tickets themselves.
  const people = async (name: string) => (await db.from('people').select('id').ilike('name', name)).data?.map((p) => p.id as string) ?? []
  const narrow: [string, string[] | string | null][] = []
  if (f.owner) narrow.push(['owner_id', f.owner.toLowerCase() === 'none' ? null : await people(f.owner)])
  if (f.accountable) narrow.push(['accountable_id', await people(f.accountable)])
  if (f.created_by) narrow.push(['created_by', await people(f.created_by)])
  if (f.external_ref) narrow.push(['external_ref', f.external_ref])
  if (narrow.length) {
    let t = db.from('tickets').select('id')
    for (const [col, v] of narrow) t = v === null ? t.is(col, null) : Array.isArray(v) ? t.in(col, v.length ? v : ['00000000-0000-0000-0000-000000000000']) : t.eq(col, v)
    const { data } = await t
    query = query.in('id', (data ?? []).map((x) => x.id).concat('00000000-0000-0000-0000-000000000000'))
  }
  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ total: count ?? data.length, tickets: await ticketsJson(db, data.map((r) => r.id as string)) })
}

/**
 * POST /api/tickets: one ticket, or an array of up to 200, each filled in completely: kind
 * (defect, test_mismatch, task), title, description, severity, priority, owner, accountable,
 * area, sprint, tc_ids, requirement_ids, defect_id, external_ref, depends_on, related, parent,
 * blocked. Answers with the stored ticket (201), or per item for an array.
 */
export async function POST(request: NextRequest) {
  const caller = await authenticate(request)
  if (caller instanceof NextResponse) return caller
  const denied = need(caller, 'create')
  if (denied) return denied
  const body = await request.json().catch(() => undefined)
  if (body === undefined) return NextResponse.json({ error: 'Body must be JSON' }, { status: 400 })
  const dry = isDryRun(request)
  if (Array.isArray(body)) {
    const list = BulkCreate.safeParse(body)
    if (!list.success) return NextResponse.json({ error: 'Send 1 to 200 tickets' }, { status: 400 })
    const results = []
    for (const [i, item] of list.data.entries()) {
      const p = TicketCreate.safeParse(item)
      if (!p.success) { results.push({ index: i, status: 400, ...issuesOf(p.error, CREATE_FIELDS) }); continue }
      const res = await createTicket(caller, p.data, dry)
      results.push(isFailure(res) ? { index: i, ...res } : { index: i, status: res.created ? 201 : 200, ...res })
    }
    return NextResponse.json({ created: results.filter((r) => r.status === 201).length, results })
  }
  const p = TicketCreate.safeParse(body)
  if (!p.success) return NextResponse.json(issuesOf(p.error, CREATE_FIELDS), { status: 400 })
  const res = await createTicket(caller, p.data, dry)
  if (isFailure(res)) return NextResponse.json(res, { status: res.status })
  return NextResponse.json(res, { status: res.created ? 201 : 200 })
}

/**
 * PATCH /api/tickets: many tickets in one call, either { keys: [...], set: { ...change } } or
 * { tickets: [{ key, ...change }] } (up to 200). Each change is as for PATCH /api/tickets/{key};
 * the answer has a result per key, and one ticket's refusal does not stop the others.
 */
export async function PATCH(request: NextRequest) {
  const caller = await authenticate(request)
  if (caller instanceof NextResponse) return caller
  const b = BulkChange.safeParse(await request.json().catch(() => null))
  if (!b.success) return NextResponse.json({ error: 'Send { keys, set } or { tickets: [{ key, ... }] }, up to 200', issues: b.error.issues.slice(0, 5) }, { status: 400 })
  const d = b.data
  const items = 'keys' in d ? d.keys.map((key) => ({ key, change: d.set as Record<string, unknown> })) : d.tickets.map(({ key, ...change }) => ({ key, change }))
  const dry = isDryRun(request)
  const results = []
  for (const { key, change } of items) {
    const p = TicketChange.safeParse(change)
    if (!p.success) { results.push({ key, status: 400, ...issuesOf(p.error, CHANGE_FIELDS) }); continue }
    const denied = need(caller, needsAssign(p.data) && Object.keys(p.data).length <= 2 ? 'assign' : 'update')
    if (denied) { results.push({ key, status: 403, error: 'This token cannot make that change' }); continue }
    const res = await changeTicket(caller, key, p.data, dry)
    results.push(isFailure(res) ? { ...res, key } : { ...res, key, status: 200 })
  }
  return NextResponse.json({ changed: results.filter((r) => r.status === 200).length, results })
}
