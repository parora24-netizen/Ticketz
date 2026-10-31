import { NextResponse, type NextRequest } from 'next/server'
import { authenticate, raiseTicket, ticketUrl } from '@/lib/ci-api'
import { ListQuery, RaisePayload, readQuery } from '@/lib/tickets-api'

/**
 * GET /api/tickets: tickets for the suite or another tool, e.g. ?state=open&tc_id=TC_FN_070,TC_FN_071
 * to see which failing tests already have an open ticket. Filters: state (comma list or "open"),
 * tc_id, defect_id, sprint (name), severity, kind, updated_since (ISO time), limit (max 1000).
 * Auth: `Authorization: Bearer <token from Admin → CI tokens>`.
 */
export async function GET(request: NextRequest) {
  const caller = await authenticate(request)
  if (caller instanceof NextResponse) return caller
  const q = readQuery(ListQuery, request.nextUrl.searchParams)
  if (!q.success) return NextResponse.json({ error: 'Invalid query', issues: q.error.issues.slice(0, 10) }, { status: 400 })
  const f = q.data

  const { data: sprints } = await caller.db.from('sprints').select('id, name')
  const sprintName = new Map((sprints ?? []).map((s) => [s.id as string, s.name as string]))
  let query = caller.db.from('ticket_list')
    .select('key, title, kind, state, severity, owner_name, tc_id, zone, page, current_sprint_id, fixed_in_build, blocked_reason, defect_id, logged_on, updated_at', { count: 'exact' })
    .order('updated_at', { ascending: false }).order('key').limit(f.limit)
  if (f.state) query = query.in('state', f.state)
  if (f.tc_id?.length) query = query.in('tc_id', f.tc_id)
  if (f.defect_id?.length) query = query.in('defect_id', f.defect_id)
  if (f.severity) query = query.eq('severity', f.severity)
  if (f.kind) query = query.eq('kind', f.kind)
  if (f.updated_since) query = query.gte('updated_at', f.updated_since)
  if (f.sprint) {
    const id = (sprints ?? []).find((s) => String(s.name).toLowerCase() === f.sprint!.toLowerCase())?.id
    if (!id) return NextResponse.json({ error: `No sprint ${f.sprint}` }, { status: 404 })
    query = query.eq('current_sprint_id', id)
  }
  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({
    total: count ?? data.length,
    tickets: data.map((t) => ({
      key: t.key, title: t.title, kind: t.kind, state: t.state, severity: t.severity, owner: t.owner_name,
      tc_id: t.tc_id, defect_id: t.defect_id, area: t.zone ? `${t.zone} · ${t.page}` : null,
      sprint: t.current_sprint_id ? sprintName.get(t.current_sprint_id) ?? null : null,
      fixed_in_build: t.fixed_in_build, blocked: t.blocked_reason, logged_on: t.logged_on, updated_at: t.updated_at, url: ticketUrl(t.key),
    })),
  })
}

/**
 * POST /api/tickets: raise a ticket for a failing test case. If one of the same kind is already
 * open, the failure is added to it as a comment instead (201 when created, 200 when added).
 * With defect_id, the open ticket for that defect is the one added to, whichever case raised it.
 * Body: { tc_id, defect_id?, kind?: "defect" | "test_mismatch", title?, description?, severity?, build?, run_id?, error?, url? }
 */
export async function POST(request: NextRequest) {
  const caller = await authenticate(request)
  if (caller instanceof NextResponse) return caller
  const body = await request.json().catch(() => null)
  const p = RaisePayload.safeParse(body)
  if (!p.success) return NextResponse.json({ error: 'Invalid payload', issues: p.error.issues.slice(0, 10) }, { status: 400 })
  const res = await raiseTicket(caller, p.data)
  if ('error' in res) return NextResponse.json({ error: res.error }, { status: res.status })
  return NextResponse.json(res, { status: res.created ? 201 : 200 })
}
