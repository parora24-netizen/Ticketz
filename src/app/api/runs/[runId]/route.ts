import { NextResponse, type NextRequest } from 'next/server'
import { authenticate, need } from '@/lib/ci-api'
import { audit, isDryRun } from '@/lib/automation-server'
import { RunUpdate, countsByPage } from '@/lib/runs'
import { getRun, runJson, runResults } from '@/lib/runs-server'

/** GET /api/runs/{run_id}: the run, its counts by page and its phases. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  const caller = await authenticate(request)
  if (caller instanceof NextResponse) return caller
  const runId = decodeURIComponent((await params).runId)
  const run = await getRun(caller.db, runId)
  if (!run) return NextResponse.json({ error: `No run ${runId}` }, { status: 404 })
  const [results, { data: phases }] = await Promise.all([runResults(caller.db, runId), caller.db.from('run_phases').select('phase, at, duration_s, outcome, detail').eq('run_id', runId).order('at')])
  return NextResponse.json({ ...runJson(run), by_page: countsByPage(results), phases: phases ?? [] })
}

/**
 * PATCH /api/runs/{run_id}: progress while it runs (tests_done, passed, failed, known_defect,
 * not_tested, eta), the end (finished_at, exit: finished | killed | gave_up | refused, bundle_end,
 * confounded, wall_min, worker_min) and environment counters (creates_failed, rate_limit_waits,
 * http_503, lock_wait_min).
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  const caller = await authenticate(request)
  if (caller instanceof NextResponse) return caller
  const denied = need(caller, 'automation')
  if (denied) return denied
  const runId = decodeURIComponent((await params).runId)
  const p = RunUpdate.safeParse(await request.json().catch(() => null))
  if (!p.success) return NextResponse.json({ error: 'Invalid payload', issues: p.error.issues.slice(0, 10).map((i) => ({ path: i.path.join('.'), message: i.message })) }, { status: 400 })
  const { data: run } = await caller.db.from('suite_runs').select('run_id').eq('run_id', runId).maybeSingle()
  if (!run) return NextResponse.json({ error: `No run ${runId}; start it with POST /api/runs` }, { status: 404 })
  if (isDryRun(request)) return NextResponse.json({ run_id: runId, would_change: Object.keys(p.data), dry_run: true })
  const { error } = await caller.db.from('suite_runs').update({ ...p.data, updated_at: new Date().toISOString() }).eq('run_id', runId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (p.data.exit) await audit(caller, request, `Run ${runId} ended: ${p.data.exit}`)
  return NextResponse.json({ run_id: runId, updated: Object.keys(p.data) })
}
