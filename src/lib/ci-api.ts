import 'server-only'
import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'
import { serverEnv } from '@/lib/env'
import { currentSprint, type Sprint } from '@/lib/data'
import { bearer } from '@/lib/results'
import { OPEN, failureText, nextKey, type RaisePayload } from '@/lib/tickets-api'

type Db = ReturnType<typeof createServiceClient>
export type Caller = { db: Db; tokenId: string; actorId: string | null }

/**
 * Checks the CI token on an API call. The calls run with the server's key, so each route keeps
 * to QA's rules itself. Comments and tickets are credited to whoever made the token.
 */
export async function authenticate(request: Request): Promise<Caller | NextResponse> {
  const token = bearer(request.headers.get('authorization'))
  if (!token) return NextResponse.json({ error: 'Missing bearer token' }, { status: 401 })
  const db = createServiceClient()
  const hash = createHash('sha256').update(token).digest('hex')
  const { data: tok } = await db.from('ci_tokens').select('id, created_by').eq('token_hash', hash).is('revoked_at', null).maybeSingle()
  if (!tok) return NextResponse.json({ error: 'Unknown or revoked token' }, { status: 401 })
  await db.from('ci_tokens').update({ last_used_at: new Date().toISOString() }).eq('id', tok.id)
  return { db, tokenId: tok.id, actorId: tok.created_by }
}

export const ticketUrl = (key: string) => `${serverEnv().appUrl || 'https://vulqan-launchpad.vercel.app'}/tickets/${encodeURIComponent(key)}`

/** A comment from the suite; it needs a person behind it, the token's maker. */
export async function addComment(c: Caller, ticketId: string, body: string): Promise<string | null> {
  if (!c.actorId) return 'This token has no owner to post comments as; make a new token on Admin'
  const { error } = await c.db.from('ticket_comments').insert({ ticket_id: ticketId, author_id: c.actorId, body: `CI: ${body}`.slice(0, 5000) })
  return error?.message ?? null
}

/**
 * Raise a ticket for a failing test case, or, when one of the same kind is already open, add the
 * new failure to it as a comment so repeat failures never make duplicates. New tickets are found in
 * the running test sprint and go to the next fix sprint, like a fail recorded in the app.
 */
export async function raiseTicket(c: Caller, p: RaisePayload): Promise<{ key: string; created: boolean; url: string } | { error: string; status: number }> {
  const { data: tc } = await c.db.from('test_cases').select('id, tc_id, title, priority').eq('tc_id', p.tc_id).maybeSingle()
  if (!tc) return { error: `No test case ${p.tc_id}`, status: 404 }
  const text = failureText(p)

  const { data: open } = await c.db.from('tickets').select('id, key').eq('case_id', tc.id).eq('kind', p.kind).in('state', OPEN)
    .order('logged_on', { ascending: false }).limit(1).maybeSingle()
  if (open) {
    const err = await addComment(c, open.id, `Failed again.${text ? `\n${text}` : ''}`)
    if (err) return { error: err, status: 500 }
    return { key: open.key, created: false, url: ticketUrl(open.key) }
  }

  const { data: sprintRows } = await c.db.from('sprints').select('*')
  const sprints = (sprintRows ?? []) as Sprint[]
  const today = new Date().toISOString().slice(0, 10)
  const fix = sprints.filter((s) => s.kind === 'fix' && s.status !== 'closed').sort((a, b) => a.starts_on.localeCompare(b.starts_on))
  const fixSprint = fix.find((s) => s.status === 'planned' && s.starts_on > today) ?? fix.find((s) => s.ends_on >= today) ?? null
  const base = `${p.kind === 'defect' ? 'DEV' : 'MM'}-${tc.tc_id}`
  const { data: taken } = await c.db.from('tickets').select('key').like('key', `${base}%`)
  const key = nextKey(p.kind, tc.tc_id, new Set((taken ?? []).map((t) => t.key as string)))

  const { error } = await c.db.from('tickets').insert({
    key, case_id: tc.id, kind: p.kind, title: p.title ?? tc.title, description: text || null,
    severity: p.severity ?? tc.priority, found_in_sprint_id: currentSprint(sprints)?.id ?? null,
    current_sprint_id: fixSprint?.id ?? null, created_by: c.actorId,
  })
  if (error) return { error: error.message, status: 500 }
  return { key, created: true, url: ticketUrl(key) }
}
