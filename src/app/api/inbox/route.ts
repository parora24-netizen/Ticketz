import { NextResponse, type NextRequest } from 'next/server'
import { authenticate } from '@/lib/ci-api'
import { loadInbox, personByName } from '@/lib/asks-server'

/**
 * GET /api/inbox?owner=<name>: what waits on one person: asks, retests, pull requests to review,
 * cases to complete or rewrite, and, for the lead, what is overdue or has no owner. A personal
 * token can leave owner out to read its own person's.
 */
export async function GET(request: NextRequest) {
  const caller = await authenticate(request)
  if (caller instanceof NextResponse) return caller
  const owner = request.nextUrl.searchParams.get('owner')
  let id = owner ? null : caller.actorId
  if (owner) {
    const p = await personByName(caller.db, owner)
    if ('error' in p) return NextResponse.json({ error: p.error }, { status: 404 })
    id = p.id
  }
  const { data: person } = id ? await caller.db.from('people').select('id, name, role').eq('id', id).maybeSingle() : { data: null }
  if (!person) return NextResponse.json({ error: 'Say whose inbox: ?owner=<name>' }, { status: 400 })
  return NextResponse.json({ owner: person.name, items: await loadInbox(caller.db, person) })
}
