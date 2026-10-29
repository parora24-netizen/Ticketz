import { NextResponse, type NextRequest } from 'next/server'
import { authenticate, ticketUrl } from '@/lib/ci-api'

/** GET /api/tickets/{key}: one ticket with its history of moves and its comments. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const caller = await authenticate(request)
  if (caller instanceof NextResponse) return caller
  const { key } = await params
  const { data: t } = await caller.db.from('ticket_list').select('*').ilike('key', decodeURIComponent(key)).maybeSingle()
  if (!t) return NextResponse.json({ error: `No ticket ${key}` }, { status: 404 })
  const [{ data: events }, { data: comments }, { data: sprint }] = await Promise.all([
    caller.db.from('ticket_events').select('from_state, to_state, note, at, people(name)').eq('ticket_id', t.id).order('at'),
    caller.db.from('ticket_comments').select('body, created_at, people(name)').eq('ticket_id', t.id).order('created_at'),
    t.current_sprint_id ? caller.db.from('sprints').select('name').eq('id', t.current_sprint_id).maybeSingle() : Promise.resolve({ data: null }),
  ])
  const who = (p: unknown) => (p as { name: string } | null)?.name ?? null
  return NextResponse.json({
    key: t.key, title: t.title, kind: t.kind, state: t.state, severity: t.severity, owner: t.owner_name,
    tc_id: t.tc_id, area: t.zone ? `${t.zone} · ${t.page}` : null, sprint: sprint?.name ?? null,
    description: t.description, fixed_in_build: t.fixed_in_build, blocked: t.blocked_reason, defer_reason: t.defer_reason,
    logged_on: t.logged_on, updated_at: t.updated_at, url: ticketUrl(t.key),
    history: (events ?? []).map((e) => ({ at: e.at, from: e.from_state, to: e.to_state, note: e.note, by: who(e.people) })),
    comments: (comments ?? []).map((c) => ({ at: c.created_at, by: who(c.people), body: c.body })),
  })
}
