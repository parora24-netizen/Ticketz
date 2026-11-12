import { NextResponse, type NextRequest } from 'next/server'
import { authenticate, need } from '@/lib/ci-api'
import { isDryRun } from '@/lib/automation-server'
import { casesByAnyId } from '@/lib/ids'
import { RunWaits, waitsBySite } from '@/lib/runs'

/** GET /api/runs/{run_id}/steps: waits by site: count, median, 95th percentile, worst and total ms. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  const caller = await authenticate(request)
  if (caller instanceof NextResponse) return caller
  const runId = decodeURIComponent((await params).runId)
  const waits: { site: string; ms: number }[] = []
  for (let from = 0; ; from += 1000) {
    const { data } = await caller.db.from('run_waits').select('site, ms').eq('run_id', runId).range(from, from + 999)
    waits.push(...(data ?? []))
    if ((data ?? []).length < 1000) break
  }
  return NextResponse.json({ run_id: runId, sites: waitsBySite(waits) })
}

/**
 * POST /api/runs/{run_id}/steps: how long tests waited, in batches of up to 5,000:
 * [{ tc_id?, site, ms, outcome? }]. Sites: landing_settle, engine_open, toast, create, sign_in,
 * connection_check, pool_claim (others are kept too).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  const caller = await authenticate(request)
  if (caller instanceof NextResponse) return caller
  const denied = need(caller, 'automation')
  if (denied) return denied
  const runId = decodeURIComponent((await params).runId)
  const p = RunWaits.safeParse(await request.json().catch(() => null))
  if (!p.success) return NextResponse.json({ error: 'Send an array of 1 to 5,000 { tc_id?, site, ms, outcome? }', issues: p.error.issues.slice(0, 10).map((i) => ({ path: i.path.join('.'), message: i.message })) }, { status: 400 })
  const { data: run } = await caller.db.from('suite_runs').select('run_id').eq('run_id', runId).maybeSingle()
  if (!run) return NextResponse.json({ error: `No run ${runId}; start it with POST /api/runs` }, { status: 404 })
  const cases = await casesByAnyId(caller.db, p.data.flatMap((w) => (w.tc_id ? [w.tc_id] : [])))
  const rows = p.data.map((w) => ({ run_id: runId, case_id: w.tc_id ? cases.get(w.tc_id.toUpperCase())?.id ?? null : null, site: w.site, ms: w.ms, outcome: w.outcome ?? null }))
  const unmatched = [...new Set(p.data.filter((w) => w.tc_id && !cases.has(w.tc_id.toUpperCase())).map((w) => w.tc_id))]
  if (isDryRun(request)) return NextResponse.json({ run_id: runId, would_store: rows.length, unmatched, dry_run: true })
  for (let i = 0; i < rows.length; i += 1000) {
    const { error } = await caller.db.from('run_waits').insert(rows.slice(i, i + 1000))
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ run_id: runId, stored: rows.length, unmatched }, { status: 201 })
}
