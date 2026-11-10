import { NextResponse, type NextRequest } from 'next/server'
import { authenticate } from '@/lib/ci-api'

/** GET /api/runner: each runner's last heartbeat and its last 20 batch events. */
export async function GET(request: NextRequest) {
  const caller = await authenticate(request)
  if (caller instanceof NextResponse) return caller
  const [{ data: status }, { data: events }] = await Promise.all([
    caller.db.from('runner_status').select('state, batch, backlog, since, heartbeat_at, ci_tokens(label)'),
    caller.db.from('runner_events').select('kind, batch, detail, at, ci_tokens(label)').order('at', { ascending: false }).limit(20),
  ])
  const label = (t: unknown) => ((Array.isArray(t) ? t[0] : t) as { label: string } | null)?.label ?? null
  return NextResponse.json({
    runners: (status ?? []).map(({ ci_tokens, ...s }) => ({ token: label(ci_tokens), ...s })),
    events: (events ?? []).map(({ ci_tokens, ...e }) => ({ token: label(ci_tokens), ...e })),
  })
}
