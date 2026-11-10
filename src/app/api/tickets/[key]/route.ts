import { currentTicketKey } from '@/lib/ids'
import { NextResponse, type NextRequest } from 'next/server'
import { authenticate, need } from '@/lib/ci-api'
import { isDryRun } from '@/lib/automation-server'
import { CHANGE_FIELDS, TicketChange, issuesOf, needsAssign } from '@/lib/tickets-schema'
import { changeTicket, isFailure, ticketsJson } from '@/lib/tickets-write'

/** GET /api/tickets/{key}: one ticket in full, with its history (moves, owners, edits) and comments. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const caller = await authenticate(request)
  if (caller instanceof NextResponse) return caller
  const { key } = await params
  const current = await currentTicketKey(caller.db, decodeURIComponent(key))
  const { data: t } = current ? await caller.db.from('tickets').select('id').eq('key', current).maybeSingle() : { data: null }
  if (!t) return NextResponse.json({ error: `No ticket ${key}` }, { status: 404 })
  const [[ticket], { data: events }, { data: edits }, { data: comments }, { data: people }] = await Promise.all([
    ticketsJson(caller.db, [t.id]),
    caller.db.from('ticket_events').select('from_state, to_state, note, at, people(name)').eq('ticket_id', t.id).order('at'),
    caller.db.from('change_log').select('changes, at, actor_id').eq('row_id', t.id).eq('action', 'update').order('at'),
    caller.db.from('ticket_comments').select('body, created_at, people(name)').eq('ticket_id', t.id).order('created_at'),
    caller.db.from('people').select('id, name'),
  ])
  const who = (p: unknown) => ((Array.isArray(p) ? p[0] : p) as { name: string } | null)?.name ?? null
  const name = new Map((people ?? []).map((p) => [p.id as string, p.name as string]))
  const SKIP = ['state', 'owner_id', 'updated_at', 'blocked_at']
  return NextResponse.json({
    ...ticket,
    history: [
      ...(events ?? []).map((e) => ({ at: e.at, from: e.from_state, to: e.to_state, note: e.note, by: who(e.people) })),
      ...(edits ?? []).flatMap((e) => {
        const fields = Object.keys(e.changes ?? {}).filter((k) => !SKIP.includes(k))
        return fields.length ? [{ at: e.at, edited: fields, by: e.actor_id ? name.get(e.actor_id) ?? null : null }] : []
      }),
    ].sort((a, b) => String(a.at).localeCompare(String(b.at))),
    comments: (comments ?? []).map((c) => ({ at: c.created_at, by: who(c.people), body: c.body })),
  })
}

/**
 * PATCH /api/tickets/{key}: owner, accountable, area, severity, priority, sprint, title,
 * description, blocked (a reason, or null to unblock), fixed_in_build, defect_id, requirement_ids,
 * tc_ids, depends_on, related, parent, external_ref, and state with the app's rules (409 lists the
 * moves allowed; ready_for_retest needs fixed_in_build, duplicate needs duplicate_of, deferred
 * needs defer_reason). Answers with the updated ticket. ?dry_run=true says what would change.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const caller = await authenticate(request)
  if (caller instanceof NextResponse) return caller
  const p = TicketChange.safeParse(await request.json().catch(() => null))
  if (!p.success) return NextResponse.json(issuesOf(p.error, CHANGE_FIELDS), { status: 400 })
  const denied = need(caller, needsAssign(p.data) && Object.keys(p.data).every((k) => k === 'owner' || k === 'accountable') ? 'assign' : 'update')
  if (denied) return denied
  const res = await changeTicket(caller, decodeURIComponent((await params).key), p.data, isDryRun(request))
  if (isFailure(res)) return NextResponse.json(res, { status: res.status })
  return NextResponse.json(res)
}
