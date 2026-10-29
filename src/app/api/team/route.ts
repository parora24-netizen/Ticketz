import { NextResponse, type NextRequest } from 'next/server'
import { authenticate } from '@/lib/ci-api'

/** GET /api/team: the active team, so a comment can @mention someone by the name shown here. */
export async function GET(request: NextRequest) {
  const caller = await authenticate(request)
  if (caller instanceof NextResponse) return caller
  const { data, error } = await caller.db.from('people').select('name, role').eq('active', true).order('name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ team: data.map((p) => ({ name: p.name, role: p.role, mention: `@${p.name}` })) })
}
