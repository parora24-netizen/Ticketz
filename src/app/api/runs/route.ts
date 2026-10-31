import { NextResponse, type NextRequest } from 'next/server'
import { authenticate } from '@/lib/ci-api'
import { RunsQuery, readQuery } from '@/lib/tickets-api'

/**
 * GET /api/runs: each automated run posted to /api/results, newest first: run id, build, when it
 * was posted, the token and the person behind it, its sprint and the count of each result.
 * Filters: run_id, build (comma lists), updated_since (posted at or after), limit, offset.
 * Runs posted before 31 Oct have no token recorded.
 */
export async function GET(request: NextRequest) {
  const caller = await authenticate(request)
  if (caller instanceof NextResponse) return caller
  const q = readQuery(RunsQuery, request.nextUrl.searchParams)
  if (!q.success) return NextResponse.json({ error: 'Invalid query', issues: q.error.issues.slice(0, 10) }, { status: 400 })
  const f = q.data
  let query = caller.db.from('ci_runs').select('*', { count: 'exact' })
    .order('posted_at', { ascending: false }).order('run_id').range(f.offset, f.offset + f.limit - 1)
  if (f.run_id?.length) query = query.in('run_id', f.run_id)
  if (f.build?.length) query = query.in('build', f.build)
  if (f.updated_since) query = query.gte('posted_at', f.updated_since)
  const { data, error, count } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({
    total: count ?? data.length,
    offset: f.offset,
    runs: data.map((r) => ({
      run_id: r.run_id, build: r.build, posted_at: r.posted_at, posted_by: r.posted_by, token: r.token, sprint: r.sprint,
      results: r.results, passed: r.passed, failed: r.failed, skipped: r.skipped, known_defect: r.known_defect,
    })),
  })
}
