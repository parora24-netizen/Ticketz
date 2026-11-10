import { NextResponse, type NextRequest } from 'next/server'
import { authenticate } from '@/lib/ci-api'
import { loadHolds } from '@/lib/asks-server'

/** GET /api/screens: the screens on hold for automation, and whether each hold is on (its defect still open, its date not passed). */
export async function GET(request: NextRequest) {
  const caller = await authenticate(request)
  if (caller instanceof NextResponse) return caller
  const holds = await loadHolds(caller.db)
  return NextResponse.json({ screens: holds.map(({ id: _id, ...h }) => h) })
}
