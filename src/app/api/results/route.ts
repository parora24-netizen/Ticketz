import { createHash } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { currentSprint, type Sprint } from '@/lib/data'
import { ResultsPayload, bearer, lastPerCase } from '@/lib/results'
import { authenticate, raiseTicket } from '@/lib/ci-api'
import { ResultsQuery, readQuery } from '@/lib/tickets-api'
import { mismatch, type RunResult } from '@/lib/workflow/case-stage'

// The mismatch kinds as PostgREST filters, matching mismatch() in case-stage.
const TYPE_I = 'auto_result.in.(failed,known_defect),manual_result.eq.passed'
const TYPE_II = 'auto_result.eq.passed,manual_result.eq.failed'

const one = <T,>(v: unknown): T | null => ((Array.isArray(v) ? v[0] ?? null : v) as T | null)

/**
 * GET /api/results: results recorded in Launchpad, automated and manual. With latest=true, each
 * case's latest automated and manual result (tc_id, updated_since and mismatch filter it); otherwise every
 * result, oldest first, filtered by tc_id, kind, result, sprint, run_id, defect_id, updated_since.
 * limit (max 1000) and offset page through either.
 */
export async function GET(request: NextRequest) {
  const caller = await authenticate(request)
  if (caller instanceof NextResponse) return caller
  const q = readQuery(ResultsQuery, request.nextUrl.searchParams)
  if (!q.success) return NextResponse.json({ error: 'Invalid query', issues: q.error.issues.slice(0, 10) }, { status: 400 })
  const f = q.data
  const { data: sprints } = await caller.db.from('sprints').select('id, name')
  const sprintName = new Map((sprints ?? []).map((s) => [s.id as string, s.name as string]))
  const range = [f.offset, f.offset + f.limit - 1] as const

  if (f.latest) {
    let query = caller.db.from('case_latest')
      .select('tc_id, zone, page, tester_name, auto_result, auto_at, auto_sprint_id, manual_result, manual_at, manual_sprint_id, open_fix, awaiting_retest', { count: 'exact' })
      .order('tc_id').range(...range)
    if (f.tc_id?.length) query = query.in('tc_id', f.tc_id)
    if (f.updated_since) query = query.or(`auto_at.gte.${f.updated_since},manual_at.gte.${f.updated_since}`)
    if (f.mismatch === 'type_i') query = query.or(`and(${TYPE_I})`)
    if (f.mismatch === 'type_ii') query = query.or(`and(${TYPE_II})`)
    if (f.mismatch === 'any') query = query.or(`and(${TYPE_I}),and(${TYPE_II})`)
    const { data, error, count } = await query
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const latest = (r: string | null, at: string | null, sprint: string | null) => (r ? { result: r, at, sprint: sprint ? sprintName.get(sprint) ?? null : null } : null)
    return NextResponse.json({
      total: count ?? data.length,
      offset: f.offset,
      cases: data.map((c) => ({
        tc_id: c.tc_id, area: `${c.zone} · ${c.page}`, tester: c.tester_name,
        auto: latest(c.auto_result, c.auto_at, c.auto_sprint_id), manual: latest(c.manual_result, c.manual_at, c.manual_sprint_id),
        open_tickets: c.open_fix + c.awaiting_retest,
        mismatch: mismatch(c.auto_result as RunResult | null, c.manual_result as RunResult | null),
      })),
    })
  }

  let query = caller.db.from('test_runs')
    .select('kind, result, build, run_id, defect_id, note, url, duration_ms, sprint_id, recorded_at, test_cases!inner(tc_id), people(name)', { count: 'exact' })
    .order('recorded_at').order('id').range(...range)
  if (f.tc_id?.length) query = query.in('test_cases.tc_id', f.tc_id)
  if (f.kind) query = query.eq('kind', f.kind)
  if (f.result?.length) query = query.in('result', f.result)
  if (f.run_id) query = query.eq('run_id', f.run_id)
  if (f.defect_id) query = query.eq('defect_id', f.defect_id)
  if (f.updated_since) query = query.gte('recorded_at', f.updated_since)
  if (f.sprint) {
    const id = (sprints ?? []).find((s) => String(s.name).toLowerCase() === f.sprint!.toLowerCase())?.id
    if (!id) return NextResponse.json({ error: `No sprint ${f.sprint}` }, { status: 404 })
    query = query.eq('sprint_id', id)
  }
  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({
    total: count ?? data.length,
    offset: f.offset,
    results: data.map((r) => ({
      tc_id: one<{ tc_id: string }>(r.test_cases)?.tc_id ?? null, kind: r.kind, result: r.result,
      build: r.build, run_id: r.run_id, defect_id: r.defect_id, note: r.note, url: r.url, duration_ms: r.duration_ms,
      sprint: r.sprint_id ? sprintName.get(r.sprint_id) ?? null : null,
      by: r.kind === 'auto' ? 'CI' : one<{ name: string }>(r.people)?.name ?? null, recorded_at: r.recorded_at,
    })),
  })
}

/**
 * POST /api/results — the automated suite reports a run.
 * Auth: `Authorization: Bearer <token from Admin>`. Results land in the running sprint.
 */
export async function POST(request: NextRequest) {
  const token = bearer(request.headers.get('authorization'))
  if (!token) return NextResponse.json({ error: 'Missing bearer token' }, { status: 401 })
  const supabase = createServiceClient()
  const hash = createHash('sha256').update(token).digest('hex')
  const { data: tok } = await supabase.from('ci_tokens').select('id, created_by').eq('token_hash', hash).is('revoked_at', null).maybeSingle()
  if (!tok) return NextResponse.json({ error: 'Unknown or revoked token' }, { status: 401 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Body must be JSON' }, { status: 400 })
  }
  const parsed = ResultsPayload.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid payload', issues: parsed.error.issues.slice(0, 20) }, { status: 400 })
  }
  const { build, run_id } = parsed.data
  const results = lastPerCase(parsed.data.results)

  const ids = results.map((r) => r.tc_id)
  const caseIds = new Map<string, { id: string; automation: string }>()
  for (let i = 0; i < ids.length; i += 500) {
    const { data, error } = await supabase.from('test_cases').select('id, tc_id, automation').in('tc_id', ids.slice(i, i + 500))
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    for (const c of data ?? []) caseIds.set(String(c.tc_id).toUpperCase(), { id: c.id, automation: c.automation })
  }

  const { data: sprints } = await supabase.from('sprints').select('*')
  const sprint = currentSprint((sprints ?? []) as Sprint[])
  const rows = results.flatMap((r) => {
    const c = caseIds.get(r.tc_id)
    if (!c) return []
    return [{
      case_id: c.id,
      kind: 'auto' as const,
      result: r.status,
      build,
      run_id,
      sprint_id: sprint?.id ?? null,
      duration_ms: r.duration_ms ?? null,
      ci_token_id: tok.id,
      note: r.error ?? null,
      url: r.url ?? null,
      defect_id: r.defect_id ?? null,
    }]
  })
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await supabase.from('test_runs').insert(rows.slice(i, i + 500))
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }
  // A case that has automated results is automated.
  const newlyAutomated = [...caseIds.values()].filter((c) => c.automation === 'not_automated').map((c) => c.id)
  if (newlyAutomated.length) await supabase.from('test_cases').update({ automation: 'automated' }).in('id', newlyAutomated)
  await supabase.from('ci_tokens').update({ last_used_at: new Date().toISOString() }).eq('id', tok.id)

  // With raise_tickets, each failure gets a ticket, or a comment on the one already open (for its
  // defect_id when sent). Only failed results raise: known_defect, skipped and passed never do.
  const tickets: { tc_id: string; key?: string; created?: boolean; error?: string }[] = []
  if (parsed.data.raise_tickets) {
    const caller = { db: supabase, tokenId: tok.id, actorId: tok.created_by as string | null }
    for (const r of results.filter((x) => x.status === 'failed' && caseIds.has(x.tc_id)).slice(0, 200)) {
      const res = await raiseTicket(caller, { tc_id: r.tc_id, kind: 'defect', build, run_id, error: r.error, url: r.url, defect_id: r.defect_id })
      tickets.push('error' in res ? { tc_id: r.tc_id, error: res.error } : { tc_id: r.tc_id, key: res.key, created: res.created })
    }
  }

  return NextResponse.json({
    recorded: rows.length,
    sprint: sprint?.name ?? null,
    unmatched: ids.filter((id) => !caseIds.has(id)),
    ...(parsed.data.raise_tickets ? { tickets } : {}),
  })
}
