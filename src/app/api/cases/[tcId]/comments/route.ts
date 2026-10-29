import { NextResponse, type NextRequest } from 'next/server'
import { addCaseComment, authenticate } from '@/lib/ci-api'
import { CommentPayload } from '@/lib/tickets-api'

async function findCase(caller: Exclude<Awaited<ReturnType<typeof authenticate>>, NextResponse>, tcId: string) {
  const { data } = await caller.db.from('test_cases').select('id, tc_id').eq('tc_id', decodeURIComponent(tcId).toUpperCase()).maybeSingle()
  return data
}

/** GET /api/cases/{tc_id}/comments: the comments on a test case, oldest first. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ tcId: string }> }) {
  const caller = await authenticate(request)
  if (caller instanceof NextResponse) return caller
  const { tcId } = await params
  const c = await findCase(caller, tcId)
  if (!c) return NextResponse.json({ error: `No test case ${tcId}` }, { status: 404 })
  const { data } = await caller.db.from('case_comments').select('body, created_at, people(name)').eq('case_id', c.id).order('created_at')
  return NextResponse.json({
    tc_id: c.tc_id,
    comments: (data ?? []).map((x) => ({ at: x.created_at, by: (x.people as unknown as { name: string } | null)?.name ?? null, body: x.body })),
  })
}

/**
 * POST /api/cases/{tc_id}/comments: a question or note on a test case, where the testers read it.
 * "@Name" (a name from GET /api/team) notifies that person; the case's tester hears of the rest.
 * Body: { body }. Shows as "CI: …".
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ tcId: string }> }) {
  const caller = await authenticate(request)
  if (caller instanceof NextResponse) return caller
  const { tcId } = await params
  const p = CommentPayload.safeParse(await request.json().catch(() => null))
  if (!p.success) return NextResponse.json({ error: 'Body needs { body }' }, { status: 400 })
  const c = await findCase(caller, tcId)
  if (!c) return NextResponse.json({ error: `No test case ${tcId}` }, { status: 404 })
  const err = await addCaseComment(caller, c.id, p.data.body)
  if (err) return NextResponse.json({ error: err }, { status: 500 })
  const { data: mentioned } = await caller.db.rpc('mentioned_people', { body: p.data.body })
  return NextResponse.json({ tc_id: c.tc_id, commented: true, mentioned: ((mentioned as string[] | null) ?? []).length }, { status: 201 })
}
