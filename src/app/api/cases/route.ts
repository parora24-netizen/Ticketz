import { NextResponse, type NextRequest } from 'next/server'
import { authenticate } from '@/lib/ci-api'
import { CasesQuery } from '@/lib/tickets-api'

/**
 * GET /api/cases: the test cases, in place of the workbook download. Filters: tc_id (comma list),
 * zone, page, updated_since (ISO time; edits and new cases), limit (max 1000), offset.
 * Oldest change first, so paging with offset is stable. Auth: the CI token.
 */
export async function GET(request: NextRequest) {
  const caller = await authenticate(request)
  if (caller instanceof NextResponse) return caller
  const q = CasesQuery.safeParse(Object.fromEntries(request.nextUrl.searchParams))
  if (!q.success) return NextResponse.json({ error: 'Invalid query', issues: q.error.issues.slice(0, 10) }, { status: 400 })
  const f = q.data

  let query = caller.db.from('test_cases')
    .select('tc_id, title, priority, test_type, automation, preconditions, steps, test_data, expected, source_page, created_at, updated_at, areas(zone, page), tester:people!test_cases_tester_id_fkey(name)', { count: 'exact' })
    .order('updated_at').order('tc_id').range(f.offset, f.offset + f.limit - 1)
  if (f.tc_id?.length) query = query.in('tc_id', f.tc_id)
  if (f.updated_since) query = query.gte('updated_at', f.updated_since)
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
  return NextResponse.json({
    total: count ?? data.length,
    offset: f.offset,
    cases: data.map((c) => {
      const area = one<{ zone: string; page: string }>(c.areas)
      return {
        tc_id: c.tc_id, title: c.title, zone: area?.zone ?? null, page: area?.page ?? null, source_page: c.source_page,
        priority: c.priority, type: c.test_type, automation: c.automation, tester: one<{ name: string }>(c.tester)?.name ?? null,
        preconditions: c.preconditions, steps: c.steps, test_data: c.test_data, expected: c.expected,
        created_at: c.created_at, updated_at: c.updated_at,
      }
    }),
  })
}
