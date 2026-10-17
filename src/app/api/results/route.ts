import { createHash } from 'node:crypto'
import { NextResponse, type NextRequest } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { currentSprint, type Sprint } from '@/lib/data'
import { ResultsPayload, bearer, lastPerCase } from '@/lib/results'

/**
 * POST /api/results — the automated suite reports a run.
 * Auth: `Authorization: Bearer <token from Admin>`. Results land in the running sprint.
 */
export async function POST(request: NextRequest) {
  const token = bearer(request.headers.get('authorization'))
  if (!token) return NextResponse.json({ error: 'Missing bearer token' }, { status: 401 })
  const supabase = createServiceClient()
  const hash = createHash('sha256').update(token).digest('hex')
  const { data: tok } = await supabase.from('ci_tokens').select('id').eq('token_hash', hash).is('revoked_at', null).maybeSingle()
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
      note: r.error ?? null,
      url: r.url ?? null,
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

  return NextResponse.json({
    recorded: rows.length,
    sprint: sprint?.name ?? null,
    unmatched: ids.filter((id) => !caseIds.has(id)),
  })
}
