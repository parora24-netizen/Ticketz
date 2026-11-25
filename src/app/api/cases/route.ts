import { currentTcIds } from '@/lib/ids'
import { NextResponse, type NextRequest } from 'next/server'
import { authenticate, need } from '@/lib/ci-api'
import { BulkCaseText, CaseCreate, CaseText, hasAutomationKeys, isTextChange } from '@/lib/case-text'
import { applyCaseText, createCase } from '@/lib/case-text-server'
import { CasesQuery, automationFromDb, automationToDb, readQuery } from '@/lib/tickets-api'
import { BulkCaseAutomation } from '@/lib/automation-loop'
import { applyCaseAutomation, audit, isDryRun } from '@/lib/automation-server'

/**
 * GET /api/cases: the test cases, in place of the workbook download. Filters: tc_id, scenario_id, requirement_id (comma lists),
 * zone, page, automation, priority, type, block (comma lists), needs_detail (true: Expected is a placeholder; false: leave
 * those out), updated_since (ISO time; any change), text_updated_since
 * (only a change to the case's wording), limit (max 1000), offset.
 * Oldest change first, so paging with offset is stable. Auth: the CI token.
 * automation_due_on is set per page, so changing it does not move a case's updated_at.
 * files names the files kept on each case (datasets, inputs); GET /api/cases/{tc_id}/files gives download links.
 */
export async function GET(request: NextRequest) {
  const caller = await authenticate(request)
  if (caller instanceof NextResponse) return caller
  const q = readQuery(CasesQuery, request.nextUrl.searchParams)
  if (!q.success) return NextResponse.json({ error: 'Invalid query', issues: q.error.issues.slice(0, 10) }, { status: 400 })
  const f = q.data

  let query = caller.db.from('test_cases')
    .select('tc_id, legacy_tc_id, scenario_id, requirement_id, title, priority, test_type, automation, automation_note, automation_owner, automation_ref, automation_block, automation_proposed, automation_proposed_reason, needs_detail, automation_block_ticket_id, id, revision, text_updated_at, preconditions, steps, test_data, expected, source_page, created_at, updated_at, retired_at, retired_reason, retired_as, areas(zone, page, automate_due_on, writer:people!areas_owner_id_fkey(name)), tester:people!test_cases_tester_id_fkey(name)', { count: 'exact' })
    .order('updated_at').order('tc_id').range(f.offset, f.offset + f.limit - 1)
  if (f.tc_id?.length) query = query.in('tc_id', await currentTcIds(caller.db, f.tc_id))
  if (f.scenario_id?.length) query = query.in('scenario_id', f.scenario_id)
  if (f.requirement_id?.length) query = query.in('requirement_id', f.requirement_id)
  if (f.updated_since) query = query.gte('updated_at', f.updated_since)
  if (f.text_updated_since) query = query.gte('text_updated_at', f.text_updated_since)
  if (f.automation?.length) query = query.in('automation', f.automation.map(automationToDb))
  if (f.priority?.length) query = query.in('priority', f.priority)
  if (f.type?.length) query = query.in('test_type', f.type)
  if (f.block?.length) query = query.in('automation_block', f.block)
  const retiredToo = f.retired === 'all' || (f.retired === undefined && !!(f.updated_since || f.text_updated_since || f.tc_id?.length))
  if (f.retired === 'true') query = query.not('retired_at', 'is', null)
  else if (!retiredToo) query = query.is('retired_at', null)
  if (f.needs_detail !== undefined) query = query.eq('needs_detail', f.needs_detail)
  if (f.zone || f.page) {
    const { data: areas } = await caller.db.from('areas').select('id, zone, page')
    const same = (a: string, b?: string) => !b || a.toLowerCase() === b.toLowerCase()
    const ids = (areas ?? []).filter((a) => same(a.zone, f.zone) && same(a.page, f.page)).map((a) => a.id as string)
    if (!ids.length) return NextResponse.json({ error: `No area ${[f.zone, f.page].filter(Boolean).join(' · ')}` }, { status: 404 })
    query = query.in('area_id', ids)
  }
  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const one = <T,>(v: unknown): T | null => ((Array.isArray(v) ? v[0] ?? null : v) as T | null)
  const blockIds = [...new Set(data.map((c) => c.automation_block_ticket_id).filter(Boolean))] as string[]
  const { data: blockers } = blockIds.length ? await caller.db.from('tickets').select('id, key').in('id', blockIds) : { data: [] }
  const blockKey = new Map((blockers ?? []).map((t) => [t.id as string, t.key as string]))
  const ids = data.map((c) => c.id as string)
  const { data: askLinks } = ids.length ? await caller.db.from('ask_cases').select('case_id, asks!inner(key, state)').in('case_id', ids).eq('asks.state', 'open') : { data: [] }
  // Files kept on each case; GET /api/cases/{tc_id}/files gives their download links.
  const { data: fileRows } = ids.length ? await caller.db.from('case_files').select('case_id, name, size_bytes').in('case_id', ids).order('created_at') : { data: [] }
  const filesOf = new Map<string, { name: string; size_bytes: number }[]>()
  for (const f of fileRows ?? []) filesOf.set(f.case_id as string, [...(filesOf.get(f.case_id as string) ?? []), { name: f.name as string, size_bytes: Number(f.size_bytes) }])
  const waiting = new Map<string, string[]>()
  for (const l of (askLinks ?? []) as unknown as { case_id: string; asks: { key: string } | { key: string }[] }[]) { const a = Array.isArray(l.asks) ? l.asks[0] : l.asks; if (a) waiting.set(l.case_id, [...(waiting.get(l.case_id) ?? []), a.key]) }
  return NextResponse.json({
    total: count ?? data.length,
    offset: f.offset,
    cases: data.map((c) => {
      const area = one<{ zone: string; page: string; automate_due_on: string | null; writer: { name: string } | { name: string }[] | null }>(c.areas)
      return {
        tc_id: c.tc_id, legacy_tc_id: c.legacy_tc_id, scenario_id: c.scenario_id, requirement_id: c.requirement_id, title: c.title, zone: area?.zone ?? null, page: area?.page ?? null, source_page: c.source_page,
        priority: c.priority, type: c.test_type, automation: c.automation, automation_status: automationFromDb(c.automation), automation_note: c.automation_note, automation_owner: c.automation_owner, automation_ref: c.automation_ref, automation_block: c.automation_block, automation_block_ticket: c.automation_block_ticket_id ? blockKey.get(c.automation_block_ticket_id) ?? null : null, waiting_on_asks: waiting.get(c.id as string) ?? [], automation_proposed: c.automation_proposed, automation_proposed_reason: c.automation_proposed_reason, needs_detail: c.needs_detail, automation_due_on: area?.automate_due_on ?? null, revision: c.revision, text_updated_at: c.text_updated_at, tester: one<{ name: string }>(c.tester)?.name ?? null, writer: area ? one<{ name: string }>(area.writer)?.name ?? null : null,
        preconditions: c.preconditions, steps: c.steps, test_data: c.test_data, expected: c.expected,
        files: filesOf.get(c.id as string) ?? [],
        retired: !!c.retired_at, retired_as: c.retired_at ? c.retired_as ?? 'retired' : null, retired_at: c.retired_at, retired_reason: c.retired_reason,
        created_at: c.created_at, updated_at: c.updated_at,
      }
    }),
  })
}

/**
 * PATCH /api/cases: automation fields on many cases in one call. Body: { cases: [{ tc_id, revision?,
 * ...the fields of PATCH /api/cases/{tc_id} }] } (up to 500). Each case is set only if it is still at
 * the revision given; the answer lists each case as updated, unchanged, conflict or not_found.
 * ?dry_run=true says what would change. Auth: a runner token.
 */
export async function PATCH(request: NextRequest) {
  const caller = await authenticate(request)
  if (caller instanceof NextResponse) return caller
  const body = await request.json().catch(() => null) as { cases?: unknown[] } | null
  // Text changes (the "cases" scope): every item must be one; automation items go in their own call.
  if (Array.isArray(body?.cases) && body.cases.some(isTextChange)) {
    const denied = need(caller, 'cases')
    if (denied) return denied
    if (!body.cases.every(isTextChange) || body.cases.some(hasAutomationKeys)) return NextResponse.json({ error: 'Send text changes and automation fields in separate calls' }, { status: 400 })
    const items = BulkCaseText.safeParse(body)
    if (!items.success) return NextResponse.json({ error: 'Invalid payload', issues: items.error.issues.slice(0, 10) }, { status: 400 })
    const parsed = items.data.cases.map(({ tc_id, ...rest }) => ({ tc_id, r: CaseText.safeParse(rest) }))
    const bad = parsed.find((x) => !x.r.success)
    if (bad && !bad.r.success) return NextResponse.json({ error: `Invalid change for ${bad.tc_id}`, issues: bad.r.error.issues.slice(0, 10) }, { status: 400 })
    const results = await applyCaseText(caller, parsed.map((x) => ({ tc_id: x.tc_id, ...(x.r.success ? x.r.data : {}) })), isDryRun(request))
    const updated = results.filter((r) => r.status === 'updated')
    if (updated.length) await audit(caller, request, `Changed the text of ${updated.length} case${updated.length === 1 ? '' : 's'}`, updated.map((r) => ({ tc_id: r.tc_id, ...r.changes })))
    const n = (s: string) => results.filter((r) => r.status === s).length
    return NextResponse.json({ updated: updated.length, would_update: n('would_update'), unchanged: n('unchanged'), conflicts: n('conflict'), not_found: n('not_found'), errors: n('error'), results })
  }
  if (caller.role !== 'runner') return NextResponse.json({ error: 'This token cannot change automation fields; use a runner token' }, { status: 403 })
  const p = BulkCaseAutomation.safeParse(body)
  if (!p.success) return NextResponse.json({ error: 'Invalid payload. "not_automatable" is proposed with automation_proposed, for a lead to approve.', issues: p.error.issues.slice(0, 10) }, { status: 400 })
  const results = await applyCaseAutomation(caller, p.data.cases, isDryRun(request))
  const updated = results.filter((r) => r.status === 'updated')
  if (updated.length) await audit(caller, request, `Set automation fields on ${updated.length} case${updated.length === 1 ? '' : 's'}`, updated.map((r) => ({ tc_id: r.tc_id, ...r.changes })))
  const count = (s: string) => results.filter((r) => r.status === s).length
  return NextResponse.json({ updated: updated.length, would_update: count('would_update'), unchanged: count('unchanged'), conflicts: count('conflict'), not_found: count('not_found'), errors: count('error'), results })
}

/**
 * POST /api/cases: add a test case. Body: zone, page, title, and optionally preconditions, steps,
 * test_data, expected, priority (default Medium), test_type, tester (a name), scenario_id and
 * comment. The server gives it the next TC_ id and answers 201 { tc_id }. ?dry_run=true says what
 * would be added. Auth: a token with the "cases" scope.
 */
export async function POST(request: NextRequest) {
  const caller = await authenticate(request)
  if (caller instanceof NextResponse) return caller
  const denied = need(caller, 'cases')
  if (denied) return denied
  const p = CaseCreate.safeParse(await request.json().catch(() => null))
  if (!p.success) return NextResponse.json({ error: 'Invalid payload', issues: p.error.issues.slice(0, 10) }, { status: 400 })
  const res = await createCase(caller, p.data, isDryRun(request))
  if (res.error) return NextResponse.json({ error: res.error }, { status: res.status ?? 400 })
  if (res.would_create) return NextResponse.json({ dry_run: true, would_create: res.would_create })
  await audit(caller, request, `Added ${res.tc_id}: ${p.data.title}`, { tc_id: res.tc_id, zone: p.data.zone, page: p.data.page })
  return NextResponse.json({ tc_id: res.tc_id }, { status: 201 })
}
