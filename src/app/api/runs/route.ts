import { NextResponse, type NextRequest } from 'next/server'
import { authenticate, need } from '@/lib/ci-api'
import { audit, isDryRun } from '@/lib/automation-server'
import { RunStart } from '@/lib/runs'
import { listRuns, runJson } from '@/lib/runs-server'

/**
 * GET /api/runs: suite runs, newest first: those posted with a lifecycle (POST /api/runs) and older
 * ones known only from their results. Filters: kind (full, batch, probe), since (ISO time), limit (max 500).
 */
export async function GET(request: NextRequest) {
  const caller = await authenticate(request)
  if (caller instanceof NextResponse) return caller
  const q = request.nextUrl.searchParams
  const runs = await listRuns(caller.db, { kind: q.get('kind') ?? undefined, since: q.get('since') ?? q.get('updated_since') ?? undefined, limit: Math.min(Number(q.get('limit')) || 100, 500) })
  const ids = q.get('run_id')?.split(',').map((s) => s.trim()).filter(Boolean)
  const list = ids?.length ? runs.filter((r) => ids.includes(r.run_id)) : runs
  return NextResponse.json({ total: list.length, runs: list.map(runJson) })
}

/**
 * POST /api/runs: a run starting, keyed by run_id; posting the same run_id again updates it.
 * Body: { run_id, kind?, target?, branch?, commit?, bundle?, workers?, tests_planned?, launcher?, started_at?, eta? }
 */
export async function POST(request: NextRequest) {
  const caller = await authenticate(request)
  if (caller instanceof NextResponse) return caller
  const denied = need(caller, 'automation')
  if (denied) return denied
  const p = RunStart.safeParse(await request.json().catch(() => null))
  if (!p.success) return NextResponse.json({ error: 'Invalid payload', issues: p.error.issues.slice(0, 10).map((i) => ({ path: i.path.join('.'), message: i.message })) }, { status: 400 })
  const { data: existing } = await caller.db.from('suite_runs').select('run_id').eq('run_id', p.data.run_id).maybeSingle()
  if (isDryRun(request)) return NextResponse.json({ run_id: p.data.run_id, created: !existing, dry_run: true })
  const { error } = await caller.db.from('suite_runs').upsert({ ...p.data, token_id: caller.tokenId, updated_at: new Date().toISOString() }, { onConflict: 'run_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await audit(caller, request, `${existing ? 'Updated' : 'Started'} run ${p.data.run_id}`)
  return NextResponse.json({ run_id: p.data.run_id, created: !existing }, { status: existing ? 200 : 201 })
}
