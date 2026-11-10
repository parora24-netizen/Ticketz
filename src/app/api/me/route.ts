import { NextResponse, type NextRequest } from 'next/server'
import { authenticate } from '@/lib/ci-api'

/** GET /api/me: which token this is, who it acts as, and what it may do. */
export async function GET(request: NextRequest) {
  const caller = await authenticate(request)
  if (caller instanceof NextResponse) return caller
  const { data: p } = caller.actorId ? await caller.db.from('people').select('name, role').eq('id', caller.actorId).maybeSingle() : { data: null }
  return NextResponse.json({ token: caller.label ?? null, acts_as: p?.name ?? null, moves_tickets_as: p && caller.role === 'tester' ? p.role : 'qa', role: caller.role, scopes: caller.scopes })
}
