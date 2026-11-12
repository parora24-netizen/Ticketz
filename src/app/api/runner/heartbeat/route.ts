import { NextResponse, type NextRequest } from 'next/server'
import { authenticate } from '@/lib/ci-api'
import { Heartbeat } from '@/lib/automation-loop'
import { isDryRun } from '@/lib/automation-server'

/**
 * POST /api/runner/heartbeat: { state: idle | batching | paused_limit | cluster_down, batch?, backlog?, since? }.
 * Send it every few minutes; the board shows it, and the lead is alerted when it stops, or when the
 * runner sits idle with cases waiting.
 */
export async function POST(request: NextRequest) {
  const caller = await authenticate(request)
  if (caller instanceof NextResponse) return caller
  if (caller.role !== 'runner') return NextResponse.json({ error: 'Use a runner token' }, { status: 403 })
  const p = Heartbeat.safeParse(await request.json().catch(() => null))
  if (!p.success) return NextResponse.json({ error: 'Invalid payload', issues: p.error.issues.slice(0, 10) }, { status: 400 })
  const { data: before } = await caller.db.from('runner_status').select('state, since').eq('token_id', caller.tokenId).maybeSingle()
  const now = new Date().toISOString()
  const since = p.data.since ?? (before?.state === p.data.state ? before.since : now)
  if (isDryRun(request)) return NextResponse.json({ ok: true, since, dry_run: true })
  const { error } = await caller.db.from('runner_status').upsert({ token_id: caller.tokenId, state: p.data.state, batch: p.data.batch ?? null, backlog: p.data.backlog ?? null, since, heartbeat_at: now })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, since })
}
