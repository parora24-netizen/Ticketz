import { currentTcIds } from '@/lib/ids'
import { NextResponse, type NextRequest } from 'next/server'
import { authenticate } from '@/lib/ci-api'
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
 */
export async function GET(request: NextRequest) {
  const caller = await authenticate(request)
  if (caller instanceof NextResponse) return caller
  const q = readQuery(CasesQuery, request.nextUrl.searchParams)
  if (!q.success) return NextResponse.json({ error: 'Invalid query', issues: q.error.issues.slice(0, 10) }, { status: 400 })
  const f = q.data

  let query = caller.db.from('test_cases')
    .select('tc_id, legacy_tc_id, scenario_id, requirement_id, title, priority, test_type, automation, automation_note, automation_owner, automation_ref, automation_block, automation_proposed, automation_proposed_reason, needs_detail, automation_block_ticket_id, id, revision, text_updated_at, preconditions, steps, test_data, expected, source_page, created_at, updated_at, areas(zone, page, automate_due_on), tester:people!test_cases_tester_id_fkey(name)', { count: 'exact' })
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
  const waiting = new Map<string, string[]>()
  for (const l of (askLinks ?? []) as unknown as { case_id: string; asks: { key: string } | { key: string }[] }[]) { const a = Array.isArray(l.asks) ? l.asks[0] : l.asks; if (a) waiting.set(l.case_id, [...(waiting.get(l.case_id) ?? []), a.key]) }
  return NextResponse.json({
    total: count ?? data.length,
    offset: f.offset,
    cases: data.map((c) => {
      const area = one<{ zone: string; page: string; automate_due_on: string | null }>(c.areas)
      return {
        tc_id: c.tc_id, legacy_tc_id: c.legacy_tc_id, scenario_id: c.scenario_id, requirement_id: c.requirement_id, title: c.title, zone: area?.zone ?? null, page: area?.page ?? null, source_page: c.source_page,
        priority: c.priority, type: c.test_type, automation: c.automation, automation_status: automationFromDb(c.automation), automation_note: c.automation_note, automation_owner: c.automation_owner, automation_ref: c.automation_ref, automation_block: c.automation_block, automation_block_ticket: c.automation_block_ticket_id ? blockKey.get(c.automation_block_ticket_id) ?? null : null, waiting_on_asks: waiting.get(c.id as string) ?? [], automation_proposed: c.automation_proposed, automation_proposed_reason: c.automation_proposed_reason, needs_detail: c.needs_detail, automation_due_on: area?.automate_due_on ?? null, revision: c.revision, text_updated_at: c.text_updated_at, tester: one<{ name: string }>(c.tester)?.name ?? null,
        preconditions: c.preconditions, steps: c.steps, test_data: c.test_data, expected: c.expected,
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
  if (caller.role !== 'runner') return NextResponse.json({ error: 'This token cannot change automation fields; use a runner token' }, { status: 403 })
  const p = BulkCaseAutomation.safeParse(await request.json().catch(() => null))
  if (!p.success) return NextResponse.json({ error: 'Invalid payload. "not_automatable" is proposed with automation_proposed, for a lead to approve.', issues: p.error.issues.slice(0, 10) }, { status: 400 })
  const results = await applyCaseAutomation(caller, p.data.cases, isDryRun(request))
  const updated = results.filter((r) => r.status === 'updated')
  if (updated.length) await audit(caller, request, `Set automation fields on ${updated.length} case${updated.length === 1 ? '' : 's'}`, updated.map((r) => ({ tc_id: r.tc_id, ...r.changes })))
  const count = (s: string) => results.filter((r) => r.status === s).length
  return NextResponse.json({ updated: updated.length, would_update: count('would_update'), unchanged: count('unchanged'), conflicts: count('conflict'), not_found: count('not_found'), errors: count('error'), results })
}
