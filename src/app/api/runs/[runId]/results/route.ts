import { NextResponse, type NextRequest } from 'next/server'
import { authenticate } from '@/lib/ci-api'
import { runResults } from '@/lib/runs-server'

/**
 * GET /api/runs/{run_id}/results: every result in the run with its telemetry. Filters: outcome
 * (passed, failed, known_defect, not_tested, or a finer outcome such as timed_out), zone, page.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ runId: string }> }) {
  const caller = await authenticate(request)
  if (caller instanceof NextResponse) return caller
  const runId = decodeURIComponent((await params).runId)
  const q = request.nextUrl.searchParams
  const want = q.get('outcome')
  const same = (a: string, b: string | null) => !b || a.toLowerCase() === b.toLowerCase()
  const rows = (await runResults(caller.db, runId)).filter((r) => same(r.zone, q.get('zone')) && same(r.page, q.get('page'))
    && (!want || r.outcome === want || (want === 'not_tested' ? r.result === 'skipped' : r.result === want)))
  return NextResponse.json({ run_id: runId, total: rows.length, results: rows })
}
