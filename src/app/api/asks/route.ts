import { NextResponse, type NextRequest } from 'next/server'
import { authenticate } from '@/lib/ci-api'
import { AskCreate, ASK_KINDS } from '@/lib/automation-loop'
import { askJson, createAsk, personByName, type AskRow } from '@/lib/asks-server'
import { audit, isDryRun } from '@/lib/automation-server'
import { casesByAnyId } from '@/lib/ids'

/**
 * GET /api/asks: what someone has to do for automation to go on: needs (a server, an account, a
 * mailbox), questions and decisions. Filters: kind, state (open, done, declined, or the kind's word:
 * requested, provided, answered, decided), owner, need_key, case (a tc_id), limit (max 500).
 */
export async function GET(request: NextRequest) {
  const caller = await authenticate(request)
  if (caller instanceof NextResponse) return caller
  const q = request.nextUrl.searchParams
  let query = caller.db.from('asks').select('*').order('created_at', { ascending: false }).limit(Math.min(Number(q.get('limit')) || 200, 500))
  const kind = q.get('kind')
  if (kind) {
    if (!(ASK_KINDS as readonly string[]).includes(kind)) return NextResponse.json({ error: 'kind is need, question or decision' }, { status: 400 })
    query = query.eq('kind', kind)
  }
  const state = q.get('state')
  if (state) query = query.eq('state', ['requested', 'open'].includes(state) ? 'open' : state === 'declined' ? 'declined' : 'done')
  if (q.get('need_key')) query = query.eq('need_key', q.get('need_key')!)
  if (q.get('owner')) {
    const p = await personByName(caller.db, q.get('owner')!)
    if ('error' in p) return NextResponse.json({ error: p.error }, { status: 404 })
    query = query.eq('owner_id', p.id)
  }
  if (q.get('case')) {
    const c = (await casesByAnyId(caller.db, [q.get('case')!])).get(q.get('case')!.toUpperCase())
    if (!c) return NextResponse.json({ error: `No test case ${q.get('case')}` }, { status: 404 })
    const { data: links } = await caller.db.from('ask_cases').select('ask_id').eq('case_id', c.id)
    query = query.in('id', (links ?? []).map((l) => l.ask_id))
  }
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ asks: await askJson(caller.db, data as AskRow[]) })
}

/**
 * POST /api/asks: ask for something, linked to the cases waiting on it. A need with a need_key that
 * is already open (e.g. "server.mssql") gets these cases added instead of a second need.
 * Body: { kind, title, detail?, need_key?, store?, options?, owner?, due_on?, cases?, ticket? }
 */
export async function POST(request: NextRequest) {
  const caller = await authenticate(request)
  if (caller instanceof NextResponse) return caller
  const p = AskCreate.safeParse(await request.json().catch(() => null))
  if (!p.success) return NextResponse.json({ error: 'Invalid payload', issues: p.error.issues.slice(0, 10) }, { status: 400 })
  const res = await createAsk(caller.db, p.data, { personId: caller.actorId, tokenId: caller.tokenId }, isDryRun(request))
  if ('error' in res) return NextResponse.json({ error: res.error }, { status: res.status })
  if (!('dry_run' in res)) await audit(caller, request, `${res.created ? 'Asked' : 'Added cases to'} ${res.key}: ${p.data.title}`, { cases_linked: res.cases_linked })
  return NextResponse.json(res, { status: res.created && !('dry_run' in res) ? 201 : 200 })
}
