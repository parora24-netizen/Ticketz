import 'server-only'
import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { serverEnv } from '@/lib/env'
import { currentSprint, type Sprint } from '@/lib/data'
import { bearer } from '@/lib/results'
import { OPEN, failureText, nextKey, type RaisePayload } from '@/lib/tickets-api'
import { fixSprintForArea } from '@/lib/workflow/fix-sprint'

type Db = ReturnType<typeof createServiceClient>
export type Caller = { db: Db; tokenId: string; actorId: string | null }

/** The "CI" person the API acts as, so its tickets, comments and runs read as CI. */
export const CI_EMAIL = 'ci@launchpad.invalid'
export async function ciActor(db: Db, fallback: string | null): Promise<string | null> {
  const { data } = await db.from('people').select('id').eq('email', CI_EMAIL).maybeSingle()
  return data?.id ?? fallback
}

/**
 * Checks the CI token on an API call. The calls run with the server's key, so each route keeps
 * to QA's rules itself. Tickets and comments are credited to the token's person (a personal token),
 * else to CI (or the token's maker, without one).
 */
export async function authenticate(request: Request): Promise<Caller | NextResponse> {
  const token = bearer(request.headers.get('authorization'))
  if (!token) return NextResponse.json({ error: 'Missing bearer token' }, { status: 401 })
  const db = createServiceClient()
  const hash = createHash('sha256').update(token).digest('hex')
  const { data: tok } = await db.from('ci_tokens').select('id, created_by, person_id').eq('token_hash', hash).is('revoked_at', null).maybeSingle()
  if (!tok) return NextResponse.json({ error: 'Unknown or revoked token' }, { status: 401 })
  await db.from('ci_tokens').update({ last_used_at: new Date().toISOString() }).eq('id', tok.id)
  return { db, tokenId: tok.id, actorId: tok.person_id ?? await ciActor(db, tok.created_by) }
}

export const ticketUrl = (key: string) => `${serverEnv().appUrl || 'https://vulqan-launchpad.vercel.app'}/tickets/${encodeURIComponent(key)}`

/** A comment from the suite, by CI (or the token's person). */
export async function addComment(c: Caller, ticketId: string, body: string): Promise<string | null> {
  if (!c.actorId) return NO_OWNER
  const { error } = await c.db.from('ticket_comments').insert({ ticket_id: ticketId, author_id: c.actorId, body: body.slice(0, 5000) })
  return error?.message ?? null
}

/** A comment on a test case; @Name mentions notify those people, as in the app. */
export async function addCaseComment(c: Caller, caseId: string, body: string): Promise<string | null> {
  if (!c.actorId) return NO_OWNER
  const { error } = await c.db.from('case_comments').insert({ case_id: caseId, author_id: c.actorId, body: body.slice(0, 5000) })
  return error?.message ?? null
}

const NO_OWNER = 'There is no CI person to post comments as; run the ci_identity migration'

/**
 * Raise a ticket for a failing test case, or add the new failure to the ticket already open for it
 * as a comment, so repeat failures never make duplicates. With a defect_id, the open ticket for that
 * defect is the one, whichever case it was raised from (one defect failing nine cases is one
 * ticket); failing that, or without one, the case's open ticket of the same kind. With nothing open, the case's
 * closed ticket is reopened (the fix did not hold), so its whole history stays on one ticket.
 * Otherwise a new ticket is found in the running test sprint and goes to the page's fix sprint.
 */
type Raised = { key: string; created: boolean; reopened?: boolean; url: string } | { error: string; status: number }

export async function raiseTicket(c: Caller, p: RaisePayload): Promise<Raised> {
  if (!p.tc_id) return raiseLoose(c, p)
  const { data: tc } = await c.db.from('test_cases').select('id, tc_id, title, priority, area_id').eq('tc_id', p.tc_id).maybeSingle()
  if (!tc) return { error: `No test case ${p.tc_id}`, status: 404 }
  const text = failureText(p)

  // The defect's open ticket first, then the case's own (which may predate defect ids).
  const same = () => c.db.from('tickets').select('id, key, case_id').in('state', OPEN).order('logged_on', { ascending: false }).limit(1)
  const { data: forDefect } = p.defect_id ? await same().eq('defect_id', p.defect_id).maybeSingle() : { data: null }
  const open = forDefect ?? (await same().eq('case_id', tc.id).eq('kind', p.kind).maybeSingle()).data
  if (open) {
    const where = open.case_id === tc.id ? 'Failed again' : `${tc.tc_id} failed too`
    const err = await addComment(c, open.id, `${where}.${text ? `\n${text}` : ''}`)
    if (err) return { error: err, status: 500 }
    return { key: open.key, created: false, url: ticketUrl(open.key) }
  }

  const { sprints, fixSprint } = await route(c, tc.area_id)
  const base = `${p.kind === 'defect' ? 'DEV' : 'MM'}-${tc.tc_id}`
  const { data: taken } = await c.db.from('tickets').select('key').like('key', `${base}%`)
  const key = nextKey(p.kind, tc.tc_id, new Set((taken ?? []).map((t) => t.key as string)))

  // Closed before and failing again: reopen it (QA's move), into the page's fix sprint when its
  // own sprint has closed.
  const { data: closed } = await c.db.from('tickets').select('id, key, current_sprint_id, defect_id').eq('case_id', tc.id).eq('kind', p.kind)
    .eq('state', 'closed').order('logged_on', { ascending: false }).order('key', { ascending: false }).limit(1).maybeSingle()
  if (closed) {
    const sprintOpen = sprints.some((s) => s.id === closed.current_sprint_id && s.status !== 'closed')
    const { error } = await c.db.from('tickets').update({
      state: 'reopened',
      ...(sprintOpen ? {} : { current_sprint_id: fixSprint?.id ?? null }),
      ...(p.defect_id && !closed.defect_id ? { defect_id: p.defect_id } : {}),
    }).eq('id', closed.id).eq('state', 'closed')
    if (error) return { error: error.message, status: 500 }
    const err = await addComment(c, closed.id, `Failed again after it was closed, so it is reopened.${text ? `\n${text}` : ''}`)
    if (err) return { error: err, status: 500 }
    return { key: closed.key, created: false, reopened: true, url: ticketUrl(closed.key) }
  }

  const { error } = await c.db.from('tickets').insert({
    key, case_id: tc.id, kind: p.kind, title: p.title ?? tc.title, description: text || null,
    severity: p.severity ?? tc.priority, found_in_sprint_id: currentSprint(sprints)?.id ?? null,
    current_sprint_id: fixSprint?.id ?? null, created_by: c.actorId, defect_id: p.defect_id ?? null,
  })
  if (error) return { error: error.message, status: 500 }
  return { key, created: true, url: ticketUrl(key) }
}

/**
 * Routed as in the app: to the fix sprint after the test sprint that tests the page (T3 -> F4),
 * else the next fix sprint.
 */
async function route(c: Caller, areaId: string | null) {
  const [{ data: sprintRows }, { data: sprintAreas }] = await Promise.all([
    c.db.from('sprints').select('*'),
    areaId ? c.db.from('sprint_areas').select('sprint_id, area_id').eq('area_id', areaId) : Promise.resolve({ data: [] }),
  ])
  const sprints = (sprintRows ?? []) as Sprint[]
  const today = new Date().toISOString().slice(0, 10)
  const fix = sprints.filter((s) => s.kind === 'fix' && s.status !== 'closed').sort((a, b) => a.starts_on.localeCompare(b.starts_on))
  const fixSprint = fixSprintForArea(areaId, sprints, sprintAreas ?? [])
    ?? fix.find((s) => s.status === 'planned' && s.starts_on > today) ?? fix.find((s) => s.ends_on >= today) ?? null
  return { sprints, fixSprint }
}

/**
 * A ticket with no test case behind it, keyed DEV-<n> like the app's. A defect_id with an open
 * ticket adds to that one instead; zone and page, when they name a page, route it like a case's.
 */
async function raiseLoose(c: Caller, p: RaisePayload): Promise<Raised> {
  const text = failureText(p)
  if (p.defect_id) {
    const { data: open } = await c.db.from('tickets').select('id, key').in('state', OPEN).eq('defect_id', p.defect_id)
      .order('logged_on', { ascending: false }).limit(1).maybeSingle()
    if (open) {
      const err = await addComment(c, open.id, `Seen again.${text ? `\n${text}` : ''}`)
      if (err) return { error: err, status: 500 }
      return { key: open.key, created: false, url: ticketUrl(open.key) }
    }
  }
  let areaId: string | null = null
  if (p.page) {
    let q = c.db.from('areas').select('id').ilike('page', p.page)
    if (p.zone) q = q.ilike('zone', p.zone)
    const { data: areas } = await q.limit(2)
    if (areas?.length !== 1) return { error: `No single page called ${p.zone ? `${p.zone} · ` : ''}${p.page}; send zone and page as in /api/cases`, status: 404 }
    areaId = areas[0].id
  }
  const { sprints, fixSprint } = await route(c, areaId)
  const { data: taken } = await c.db.from('tickets').select('key').like('key', 'DEV-%')
  const n = Math.max(0, ...(taken ?? []).map((t) => /^DEV-(\d+)$/.exec(t.key as string)?.[1]).filter(Boolean).map(Number)) + 1
  const key = `DEV-${n}`
  const { error } = await c.db.from('tickets').insert({
    key, case_id: null, area_id: areaId, kind: 'defect', title: p.title!, description: text || null,
    severity: p.severity ?? 'Medium', found_in_sprint_id: currentSprint(sprints)?.id ?? null,
    current_sprint_id: fixSprint?.id ?? null, created_by: c.actorId, defect_id: p.defect_id ?? null,
  })
  if (error) return { error: error.message, status: 500 }
  return { key, created: true, url: ticketUrl(key) }
}
