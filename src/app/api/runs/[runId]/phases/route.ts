import { NextResponse, type NextRequest } from 'next/server'
import { authenticate, need } from '@/lib/ci-api'
import { isDryRun } from '@/lib/automation-server'
import { RunPhase } from '@/lib/runs'

/** GET /api/runs/{run_id}/phases: the run's phases in order. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  const caller = await authenticate(request)
  if (caller instanceof NextResponse) return caller
  const runId = decodeURIComponent((await params).runId)
  const { data, error } = await caller.db.from('run_phases').select('phase, at, duration_s, outcome, detail').eq('run_id', runId).order('at')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ run_id: runId, phases: data })
}

/**
 * POST /api/runs/{run_id}/phases: one phase as it ends. Body: { phase, at, duration_s?, outcome:
 * ok | failed | cut | skipped, detail? }. Phases: sweep, gate_signin, gate_create, pool_reset,
 * pool_build, warmup, run, lane_094, reports, publish, post (others are kept too).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  const caller = await authenticate(request)
  if (caller instanceof NextResponse) return caller
  const denied = need(caller, 'automation')
  if (denied) return denied
  const runId = decodeURIComponent((await params).runId)
  const p = RunPhase.safeParse(await request.json().catch(() => null))
  if (!p.success) return NextResponse.json({ error: 'Invalid payload', issues: p.error.issues.slice(0, 10).map((i) => ({ path: i.path.join('.'), message: i.message })) }, { status: 400 })
  const { data: run } = await caller.db.from('suite_runs').select('run_id').eq('run_id', runId).maybeSingle()
  if (!run) return NextResponse.json({ error: `No run ${runId}; start it with POST /api/runs` }, { status: 404 })
  if (isDryRun(request)) return NextResponse.json({ run_id: runId, phase: p.data.phase, dry_run: true })
  const { error } = await caller.db.from('run_phases').insert({ run_id: runId, ...p.data })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ run_id: runId, phase: p.data.phase }, { status: 201 })
}
