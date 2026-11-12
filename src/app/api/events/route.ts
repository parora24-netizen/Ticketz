import { NextResponse, type NextRequest } from 'next/server'
import { authenticate } from '@/lib/ci-api'
import { feedEvents, type AskKind, type ChangeRow } from '@/lib/automation-loop'

const TABLES = ['test_cases', 'tickets', 'asks', 'automation_prs', 'areas']

/**
 * GET /api/events?since=<cursor>&limit=: what changed since the cursor, oldest first, for a runner
 * that cannot take incoming calls: case.text_changed, case.automation_changed, case.block_changed,
 * case.created, ticket.created, ticket.state_changed, need.provided, question.answered,
 * decision.decided (and .created, .declined, .reopened), pr.opened, pr.merged, pr.closed,
 * screen.hold_changed. Poll with the returned cursor; since=0 starts from the beginning.
 */
export async function GET(request: NextRequest) {
  const caller = await authenticate(request)
  if (caller instanceof NextResponse) return caller
  const since = Number(request.nextUrl.searchParams.get('since') ?? 0)
  const limit = Math.min(Number(request.nextUrl.searchParams.get('limit')) || 500, 1000)
  if (!Number.isInteger(since) || since < 0) return NextResponse.json({ error: 'since is a cursor from an earlier call, or 0' }, { status: 400 })
  // Long stretches of changes can make no event (e.g. a bulk import's edits); reading on past them,
  // up to 20 pages, means a caller always gets events or reaches the end.
  let rows: ChangeRow[] = []
  let cursor = since
  let more = false
  for (let page = 0; page < 20; page++) {
    const { data, error } = await caller.db.from('change_log').select('id, table_name, row_id, label, action, changes, at')
      .gt('id', cursor).in('table_name', TABLES).order('id').limit(limit)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const batch = (data ?? []) as ChangeRow[]
    more = batch.length === limit
    if (!batch.length) break
    cursor = batch.at(-1)!.id
    if (feedEvents(batch, new Map(), new Map()).length) { rows = batch; break }
    if (!more) break
  }
  const askIds = [...new Set(rows.filter((r) => r.table_name === 'asks').map((r) => r.row_id))]
  const areaIds = [...new Set(rows.filter((r) => r.table_name === 'areas').map((r) => r.row_id))]
  const [{ data: asks }, { data: areas }] = await Promise.all([
    askIds.length ? caller.db.from('asks').select('id, key, kind').in('id', askIds) : Promise.resolve({ data: [] }),
    areaIds.length ? caller.db.from('areas').select('id, zone, page').in('id', areaIds) : Promise.resolve({ data: [] }),
  ])
  const events = feedEvents(rows,
    new Map((asks ?? []).map((a) => [a.id as string, { key: a.key as string, kind: a.kind as AskKind }])),
    new Map((areas ?? []).map((a) => [a.id as string, { zone: a.zone as string, page: a.page as string }])))
  // The cursor moves past every row read, including those that made no event: always poll from it.
  return NextResponse.json({ events, cursor, more })
}
