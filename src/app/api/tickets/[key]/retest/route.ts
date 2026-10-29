import { NextResponse, type NextRequest } from 'next/server'
import { addComment, authenticate, ticketUrl } from '@/lib/ci-api'
import { RetestPayload, retestMove, failureText } from '@/lib/tickets-api'
import type { TicketState } from '@/lib/workflow/ticket-machine'

/**
 * POST /api/tickets/{key}/retest: the automated retest of a fix, on a ticket that is ready for
 * retest. A pass closes the ticket, a fail reopens it (QA's rules); the build and any note or
 * report link go on the ticket as a comment. Body: { result: "passed" | "failed", build, run_id?, note?, url? }
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const caller = await authenticate(request)
  if (caller instanceof NextResponse) return caller
  const { key } = await params
  const p = RetestPayload.safeParse(await request.json().catch(() => null))
  if (!p.success) return NextResponse.json({ error: 'Invalid payload', issues: p.error.issues.slice(0, 10) }, { status: 400 })
  const { data: t } = await caller.db.from('tickets').select('id, key, state').ilike('key', decodeURIComponent(key)).maybeSingle()
  if (!t) return NextResponse.json({ error: `No ticket ${key}` }, { status: 404 })

  const move = retestMove(t.state as TicketState, p.data.result)
  if ('error' in move) return NextResponse.json({ error: move.error, state: t.state }, { status: 409 })
  const { error } = await caller.db.from('tickets').update({ state: move.to }).eq('id', t.id).eq('state', 'ready_for_retest')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const text = failureText({ description: p.data.note, build: p.data.build, run_id: p.data.run_id, url: p.data.url })
  await addComment(caller, t.id, `Automated retest ${p.data.result}${p.data.result === 'passed' ? ', ticket closed' : ', ticket reopened'}.\n${text}`)
  return NextResponse.json({ key: t.key, state: move.to, url: ticketUrl(t.key) })
}
