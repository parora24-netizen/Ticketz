import { NextResponse, type NextRequest } from 'next/server'
import { authenticate } from '@/lib/ci-api'
import { casesByAnyId } from '@/lib/ids'
import { caseHistory } from '@/lib/runs-server'

/** GET /api/cases/{tc_id}/history: the case's automated result and duration in each run, oldest first (last 60). */
export async function GET(request: NextRequest, { params }: { params: Promise<{ tcId: string }> }) {
  const caller = await authenticate(request)
  if (caller instanceof NextResponse) return caller
  const asked = decodeURIComponent((await params).tcId).toUpperCase()
  const c = (await casesByAnyId(caller.db, [asked])).get(asked)
  if (!c) return NextResponse.json({ error: `No test case ${asked}` }, { status: 404 })
  return NextResponse.json({ tc_id: c.tc_id, history: await caseHistory(caller.db, c.id) })
}
