import { NextResponse, type NextRequest } from 'next/server'
import { addComment, authenticate } from '@/lib/ci-api'
import { CommentPayload } from '@/lib/tickets-api'

/** POST /api/tickets/{key}/comments: add a note, e.g. a log link. Body: { body }. Shows as "CI: …". */
export async function POST(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const caller = await authenticate(request)
  if (caller instanceof NextResponse) return caller
  const { key } = await params
  const p = CommentPayload.safeParse(await request.json().catch(() => null))
  if (!p.success) return NextResponse.json({ error: 'Body needs { body }' }, { status: 400 })
  const { data: t } = await caller.db.from('tickets').select('id, key').ilike('key', decodeURIComponent(key)).maybeSingle()
  if (!t) return NextResponse.json({ error: `No ticket ${key}` }, { status: 404 })
  const err = await addComment(caller, t.id, p.data.body)
  if (err) return NextResponse.json({ error: err }, { status: 500 })
  return NextResponse.json({ key: t.key, commented: true }, { status: 201 })
}
