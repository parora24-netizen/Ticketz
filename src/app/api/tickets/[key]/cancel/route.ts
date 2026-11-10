import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'
import { authenticate, need } from '@/lib/ci-api'
import { cancelTicket, isFailure } from '@/lib/tickets-write'

/** POST /api/tickets/{key}/cancel { reason }: withdraw a ticket raised by mistake. Only whoever raised it, through the API, can. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const caller = await authenticate(request)
  if (caller instanceof NextResponse) return caller
  const denied = need(caller, 'create')
  if (denied) return denied
  const p = z.strictObject({ reason: z.string().trim().min(3).max(1000) }).safeParse(await request.json().catch(() => null))
  if (!p.success) return NextResponse.json({ error: 'Send { reason } (3 to 1,000 characters)' }, { status: 400 })
  const res = await cancelTicket(caller, decodeURIComponent((await params).key), p.data.reason)
  if (isFailure(res)) return NextResponse.json(res, { status: res.status })
  return NextResponse.json(res)
}
