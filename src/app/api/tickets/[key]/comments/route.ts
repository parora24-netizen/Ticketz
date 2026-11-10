import { currentTicketKey } from '@/lib/ids'
import { NextResponse, type NextRequest } from 'next/server'
import { addComment, authenticate, need } from '@/lib/ci-api'
import { COMMENT_MAX, CommentPayload } from '@/lib/tickets-api'

/** POST /api/tickets/{key}/comments: add a note, e.g. a log link. Body: { body }. Shows as a comment by CI. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const caller = await authenticate(request)
  if (caller instanceof NextResponse) return caller
  const denied = need(caller, 'comment')
  if (denied) return denied
  const { key } = await params
  const raw = await request.json().catch(() => null) as { body?: unknown } | null
  const p = CommentPayload.safeParse(raw)
  if (!p.success) {
    const long = typeof raw?.body === 'string' && raw.body.trim().length > COMMENT_MAX
    return NextResponse.json({ error: long ? `body too long: ${raw!.body!.toString().trim().length} characters (max ${COMMENT_MAX})` : 'Send { body } with some text', max: COMMENT_MAX }, { status: 400 })
  }
  const { data: t } = await caller.db.from('tickets').select('id, key').eq('key', (await currentTicketKey(caller.db, decodeURIComponent(key))) ?? '').maybeSingle()
  if (!t) return NextResponse.json({ error: `No ticket ${key}` }, { status: 404 })
  const err = await addComment(caller, t.id, p.data.body)
  if (err) return NextResponse.json({ error: err }, { status: 500 })
  return NextResponse.json({ key: t.key, commented: true }, { status: 201 })
}
