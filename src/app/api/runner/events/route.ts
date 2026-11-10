import { NextResponse, type NextRequest } from 'next/server'
import { authenticate } from '@/lib/ci-api'
import { RunnerEvent } from '@/lib/automation-loop'

/** POST /api/runner/events: { kind: batch_started | batch_finished | batch_failed, batch?, detail? }. A failed batch alerts the lead. */
export async function POST(request: NextRequest) {
  const caller = await authenticate(request)
  if (caller instanceof NextResponse) return caller
  if (caller.role !== 'runner') return NextResponse.json({ error: 'Use a runner token' }, { status: 403 })
  const p = RunnerEvent.safeParse(await request.json().catch(() => null))
  if (!p.success) return NextResponse.json({ error: 'Invalid payload', issues: p.error.issues.slice(0, 10) }, { status: 400 })
  const { error } = await caller.db.from('runner_events').insert({ token_id: caller.tokenId, ...p.data })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true }, { status: 201 })
}
