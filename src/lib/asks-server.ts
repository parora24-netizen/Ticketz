import 'server-only'
import { askZone } from './ask-zone'
import type { SupabaseClient } from '@supabase/supabase-js'
import { OUTCOME_LABEL, askStatus, settleWith, holdActive, type AskKind, type AskState, type Outcome } from '@/lib/automation-loop'
import { casesByAnyId, currentTicketKey } from '@/lib/ids'
// Asks reach their owners in the 10:00 digest; only a discussion (a tag, a hand-over) emails as it happens.
import { emailAboutAskComment } from '@/lib/email'
import { createServiceClient } from '@/lib/supabase/server'

/**
 * Asks and the rest of the automation loop, shared by the API (server key, the runner) and the app
 * (signed-in person, the database's row rules). Each takes the client to work through.
 */
type Db = SupabaseClient
type Actor = { personId: string | null; tokenId?: string | null }
export type AskRow = {
  id: string; key: string; kind: AskKind; title: string; detail: string | null; need_key: string | null; store: string | null
  options: string[] | null; owner_id: string | null; due_on: string | null; state: AskState; answer: string | null; outcome: Outcome | null
  ticket_id: string | null; created_by: string | null; created_via: string | null; resolved_by: string | null; resolved_at: string | null; created_at: string; updated_at: string
  suite_need?: string | null; handed_from_id?: string | null; duplicate_of?: string | null; closed_at?: string | null; closed_by?: string | null
}

/** An active person by name (exact first, else the one name containing it). */
export async function personByName(db: Db, name: string): Promise<{ id: string; name: string } | { error: string }> {
  const { data } = await db.from('people').select('id, name').eq('active', true)
  const n = name.trim().toLowerCase()
  const exact = (data ?? []).filter((p) => p.name.toLowerCase() === n)
  const hits = exact.length ? exact : (data ?? []).filter((p) => p.name.toLowerCase().includes(n))
  if (hits.length === 1) return hits[0]
  return { error: hits.length ? `"${name}" could be ${hits.map((p) => p.name).join(', ')}` : `No one called "${name}" on the team` }
}

async function caseIds(db: Db, tcIds: string[]): Promise<{ ids: string[]; unmatched: string[] }> {
  if (!tcIds.length) return { ids: [], unmatched: [] }
  const found = await casesByAnyId(db, tcIds)
  return { ids: [...new Set([...found.values()].map((c) => c.id))], unmatched: tcIds.filter((t) => !found.has(t.toUpperCase())) }
}

async function ticketId(db: Db, key: string): Promise<string | null> {
  const current = await currentTicketKey(db, key)
  if (!current) return null
  const { data } = await db.from('tickets').select('id').eq('key', current).maybeSingle()
  return data?.id ?? null
}

type CreateInput = { kind: AskKind; title: string; detail?: string; need_key?: string; store?: string; options?: string[]; owner?: string; due_on?: string; cases?: string[]; ticket?: string }

/** A new ask, or for a need already open under the same key, that one with these cases added. */
export async function createAsk(db: Db, input: CreateInput, actor: Actor, dryRun = false) {
  const owner = input.owner ? await personByName(db, input.owner) : null
  if (owner && 'error' in owner) return { error: owner.error, status: 400 }
  const { ids, unmatched } = await caseIds(db, input.cases ?? [])
  // No owner given: the writer of its cases' pages (the one most of them share), who writes and rewords them.
  let ownerId = owner && 'id' in owner ? owner.id : null
  if (!ownerId && ids.length) {
    const { data: rows } = await db.from('test_cases').select('areas(owner_id)').in('id', ids)
    const n = new Map<string, number>()
    for (const r of rows ?? []) { const a = (Array.isArray(r.areas) ? r.areas[0] : r.areas) as { owner_id: string | null } | null; if (a?.owner_id) n.set(a.owner_id, (n.get(a.owner_id) ?? 0) + 1) }
    ownerId = [...n.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
  }
  const ticket = input.ticket ? await ticketId(db, input.ticket) : null
  if (input.ticket && !ticket) return { error: `No ticket ${input.ticket}`, status: 404 }
  const { data: open } = input.kind === 'need' && input.need_key
    ? await db.from('asks').select('id, key').eq('kind', 'need').eq('state', 'open').eq('need_key', input.need_key).maybeSingle()
    : { data: null }
  if (dryRun) return { key: open?.key ?? null, created: !open, cases_linked: ids.length, unmatched, dry_run: true }
  let ask = open
  if (!ask) {
    const { data, error } = await db.from('asks').insert({
      kind: input.kind, title: input.title, detail: input.detail ?? null, need_key: input.need_key ?? null, store: input.store ?? null,
      options: input.options ?? null, owner_id: ownerId, due_on: input.due_on ?? null, ticket_id: ticket,
      created_by: actor.personId, created_via: actor.tokenId ?? null,
    }).select('id, key').single()
    if (error) return { error: error.message, status: 500 }
    ask = data
  }
  if (ids.length) {
    const { error } = await db.from('ask_cases').upsert(ids.map((case_id) => ({ ask_id: ask!.id, case_id })), { ignoreDuplicates: true })
    if (error) return { error: error.message, status: 500 }
  }
  return { key: ask.key, created: !open, cases_linked: ids.length, unmatched }
}

type PatchInput = {
  title?: string; detail?: string | null; state?: string; answer?: string | null; outcome?: string | null; store?: string | null
  owner?: string | null; due_on?: string | null; add_cases?: string[]; remove_cases?: string[]; suite?: string | null; duplicate_of?: string; comment?: string
}

/** Who owns the asks waiting on a suite change (Admin setting suite_owner): the person who keeps the e2e suite. */
export async function suiteOwnerId(db: Db): Promise<string | null> {
  const { data } = await db.from('app_settings').select('value').eq('key', 'suite_owner').maybeSingle()
  return (data?.value as { person?: string } | null)?.person ?? null
}

/**
 * Change an ask. Its owner answers it with one outcome (settleWith), which does its work on the
 * cases at once: deferred and retired take them (and their open tickets) out, manual keeps them for
 * testing by hand, duplicate moves them to the ask that covers it (and closes it). Whoever raised it
 * (or the lead) then closes it, or sends it back with a comment saying why. suite hands an open ask
 * to the suite's owner until the suite can do what it needs.
 */
export async function patchAsk(db: Db, key: string, p: PatchInput, actor: Actor, dryRun = false) {
  const { data: ask } = await db.from('asks').select('*').eq('key', key.toUpperCase()).maybeSingle()
  if (!ask) return { error: `No ask ${key}`, status: 404 }
  const a = ask as AskRow
  const owner = p.owner ? await personByName(db, p.owner) : null
  if (owner && 'error' in owner) return { error: owner.error, status: 400 }
  const move = settleWith(p.state, p.outcome)
  if (move.error) return { error: move.error, status: 400 }
  const answering = a.state === 'open' && !!move.state && move.state !== 'open'
  const closing = move.state === 'closed' && a.state !== 'closed'
  const reopening = move.state === 'open' && a.state !== 'open'
  if (closing && a.state === 'open' && !move.outcome) return { error: 'Answer it first: say how (an outcome), then it can be closed', status: 400 }
  if ((closing && !answering) || reopening) {
    // Closing an answered ask, or sending one back, is for whoever raised it, or the lead.
    const { data: who } = actor.personId ? await db.from('people').select('role').eq('id', actor.personId).maybeSingle() : { data: null }
    if (actor.personId !== a.created_by && who?.role !== 'lead') return { error: `Only whoever raised ${a.key}, or the lead, can ${closing ? 'close it' : 'send it back'}`, status: 403 }
    if (reopening && !p.comment?.trim()) return { error: 'Say why it goes back', status: 400 }
  }
  const reason = (p.answer ?? '').trim()
  if (answering && move.outcome === 'replied' && !reason && !a.answer) return { error: 'Write the reply', status: 400 }
  if (answering && (move.outcome === 'deferred' || move.outcome === 'retired') && !reason) return { error: `Say why the cases are ${move.outcome}`, status: 400 }
  let dup: { id: string; key: string } | null = null
  if (answering && move.outcome === 'duplicate') {
    if (!p.duplicate_of) return { error: 'Say which ask covers it', status: 400 }
    const { data: d } = await db.from('asks').select('id, key').eq('key', p.duplicate_of.toUpperCase()).maybeSingle()
    if (!d) return { error: `No ask ${p.duplicate_of}`, status: 404 }
    if (d.id === a.id) return { error: 'An ask cannot duplicate itself', status: 400 }
    dup = d
  }
  let suiteOwner: string | null | undefined
  if (p.suite) {
    if (a.state !== 'open' && !reopening) return { error: 'Only an open ask can wait on a suite change', status: 400 }
    suiteOwner = await suiteOwnerId(db)
  }
  const ownerId = p.owner !== undefined ? (owner && 'id' in owner ? owner.id : null) : p.suite && suiteOwner ? suiteOwner : undefined
  const fields = Object.fromEntries(Object.entries({
    title: p.title, detail: p.detail, answer: p.answer, store: p.store, due_on: p.due_on,
    state: move.state, outcome: move.outcome,
    owner_id: ownerId,
    suite_need: p.suite !== undefined ? p.suite : reopening ? null : undefined,
    // A hand-off ends when the ask is answered, goes back, or someone gives it to a person.
    handed_from_id: answering || reopening || ownerId !== undefined ? null : undefined,
    duplicate_of: answering ? dup?.id ?? null : reopening ? null : undefined,
  }).filter(([, v]) => v !== undefined))
  const add = await caseIds(db, p.add_cases ?? []), remove = await caseIds(db, p.remove_cases ?? [])
  if (dryRun) return { key: a.key, changes: fields, add_cases: add.ids.length, remove_cases: remove.ids.length, unmatched: [...add.unmatched, ...remove.unmatched], dry_run: true }
  if (Object.keys(fields).length) {
    const { error } = await db.from('asks').update(fields).eq('id', a.id)
    if (error) return { error: error.message, status: 500 }
  }
  if (add.ids.length) await db.from('ask_cases').upsert(add.ids.map((case_id) => ({ ask_id: a.id, case_id })), { ignoreDuplicates: true })
  if (remove.ids.length) await db.from('ask_cases').delete().eq('ask_id', a.id).in('case_id', remove.ids)
  const effect = answering ? await applyOutcome(db, { ...a, ...fields } as AskRow, actor, dup) : undefined
  // Why it went back (or any note sent with the change) goes in its discussion.
  if (p.comment?.trim()) await commentOnAsk(db, a.key, p.comment, false, actor)
  return { key: a.key, effect }
}

/** What closing an ask does to its cases, said back to the person who closed it. */
export async function applyOutcome(db: Db, a: AskRow, actor: Actor, dup: { id: string; key: string } | null = null): Promise<string | undefined> {
  const { data: links } = await db.from('ask_cases').select('case_id').eq('ask_id', a.id)
  const ids = (links ?? []).map((l) => l.case_id as string)
  const n = (k: number) => `${k} case${k === 1 ? '' : 's'}`
  if (a.outcome === 'deferred' || a.outcome === 'retired') {
    if (!ids.length) return 'It had no cases'
    const why = `${a.key}: ${a.answer ?? a.title}`.slice(0, 2000)
    const now = new Date().toISOString()
    const { data: moved, error } = await db.from('test_cases')
      .update({ retired_at: now, retired_by: actor.personId, retired_as: a.outcome, retired_reason: why, updated_at: now })
      .in('id', ids).is('retired_at', null).select('id')
    if (error) return `The ask is closed, but the cases could not be ${a.outcome}: ${error.message}`
    const movedIds = (moved ?? []).map((m) => m.id as string)
    if (!movedIds.length) return 'Its cases were already out of the suite'
    // A case that leaves takes its open tickets with it, whatever stage they are at.
    const { data: tickets } = await createServiceClient(actor.personId).from('tickets')
      .update({ state: 'deferred', defer_reason: `Test case ${a.outcome}: ${why}`.slice(0, 2000) })
      .in('case_id', movedIds).not('state', 'in', '(closed,deferred,duplicate)').select('id')
    return `${n(movedIds.length)} ${a.outcome}${tickets?.length ? `, ${tickets.length} open ticket${tickets.length === 1 ? '' : 's'} deferred` : ''}`
  }
  if (a.outcome === 'manual') {
    if (!ids.length) return 'It had no cases'
    const { error } = await db.from('test_cases').update({
      automation: 'manual_only', automation_proposed: null, automation_decided_by: actor.personId, automation_decided_at: new Date().toISOString(),
      automation_note: `Manual only, by ${a.key}: ${a.answer ?? a.title}`.slice(0, 2000),
    }).in('id', ids)
    return error ? `The ask is closed, but the cases could not be set to manual only: ${error.message}` : `${n(ids.length)} set to manual only`
  }
  if (a.outcome === 'duplicate' && dup) {
    if (ids.length) await db.from('ask_cases').upsert(ids.map((case_id) => ({ ask_id: dup.id, case_id })), { ignoreDuplicates: true })
    return ids.length ? `${n(ids.length)} now wait on ${dup.key}` : `Covered by ${dup.key}`
  }
  return undefined
}

/**
 * A comment on an ask. Tagging @Name tells that person (and emails them); with hand, the first person
 * tagged owns the ask until they reply, when it goes back to whoever handed it over.
 */
export async function commentOnAsk(db: Db, key: string, body: string, hand: boolean, actor: Actor): Promise<{ error?: string; effect?: string }> {
  if (!actor.personId) return { error: 'Only a person can comment' }
  const text = body.trim()
  if (!text) return { error: 'Write something first' }
  const { data: ask } = await db.from('asks').select('id, key, title, state, owner_id, handed_from_id').eq('key', key.toUpperCase()).maybeSingle()
  if (!ask) return { error: `No ask ${key}` }
  const { data: people } = await db.from('people').select('id, name').eq('active', true)
  const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const tagged = (people ?? [])
    .map((p) => ({ ...p, at: text.search(new RegExp(`(^|[^\\w])@${esc(p.name)}(?![\\w])`, 'i')) }))
    .filter((p) => p.at >= 0 && p.id !== actor.personId).sort((x, y) => x.at - y.at)
  const open = ask.state === 'open'
  if (hand && open && !tagged.length) return { error: 'Tag the person to hand it to, e.g. @Inder' }
  const { error } = await db.from('ask_comments').insert({ ask_id: ask.id, author_id: actor.personId, body: text })
  if (error) return { error: error.message }
  const nameOf = (id: string | null) => (people ?? []).find((p) => p.id === id)?.name ?? 'someone'
  let effect: string | undefined
  let handedTo: string | null = null, backTo: string | null = null
  if (hand && open) {
    handedTo = tagged[0].id
    if (handedTo !== ask.owner_id) {
      const { error: e } = await db.from('asks').update({ owner_id: handedTo, handed_from_id: ask.handed_from_id ?? ask.owner_id }).eq('id', ask.id)
      if (e) return { error: `The comment is posted, but the ask could not be handed over: ${e.message}` }
      effect = `Handed to ${tagged[0].name} until they reply`
    }
  } else if (open && ask.handed_from_id && ask.owner_id === actor.personId) {
    backTo = ask.handed_from_id
    const { error: e } = await db.from('asks').update({ owner_id: backTo, handed_from_id: null }).eq('id', ask.id)
    if (e) return { error: `The comment is posted, but the ask could not go back: ${e.message}` }
    effect = `Back with ${nameOf(backTo)}`
  }
  await emailAboutAskComment(ask.key, text, actor.personId, [
    ...tagged.filter((t) => t.id !== handedTo && t.id !== backTo).map((t) => ({ id: t.id, why: 'tagged' as const })),
    ...(handedTo ? [{ id: handedTo, why: 'handed' as const }] : []),
    ...(backTo ? [{ id: backTo, why: 'back' as const }] : []),
  ])
  return { effect }
}

/** Asks as the API shows them: names, not ids; the cases waiting on each. */
export async function askJson(db: Db, rows: AskRow[]) {
  const ids = rows.map((r) => r.id)
  const [{ data: people }, { data: links }, { data: tickets }] = await Promise.all([
    db.from('people').select('id, name'),
    ids.length ? db.from('ask_cases').select('ask_id, test_cases(tc_id, area_id, areas(zone))').in('ask_id', ids) : Promise.resolve({ data: [] }),
    db.from('tickets').select('id, key').in('id', rows.map((r) => r.ticket_id).filter(Boolean) as string[]),
  ])
  const dupIds = rows.map((r) => r.duplicate_of).filter(Boolean) as string[]
  const { data: dups } = dupIds.length ? await db.from('asks').select('id, key').in('id', dupIds) : { data: [] }
  const dupKey = new Map((dups ?? []).map((d) => [d.id as string, d.key as string]))
  // Each page's fix sprint (the first it is planned in), for the sprint an ask's cases belong to.
  const [{ data: fixSprints }, { data: planned }] = await Promise.all([
    db.from('sprints').select('id, name, starts_on').eq('kind', 'fix').order('starts_on'),
    db.from('sprint_areas').select('sprint_id, area_id'),
  ])
  const sprintOfArea = new Map<string, { name: string; starts_on: string }>()
  for (const s of fixSprints ?? []) for (const x of planned ?? []) if (x.sprint_id === s.id && !sprintOfArea.has(x.area_id)) sprintOfArea.set(x.area_id, s)
  const askSprints = new Map<string, Map<string, string>>()
  const name = new Map((people ?? []).map((p) => [p.id, p.name]))
  const key = new Map((tickets ?? []).map((t) => [t.id, t.key]))
  const cases = new Map<string, string[]>()
  const zones = new Map<string, Set<string>>()
  type Linked = { tc_id: string; area_id: string; areas: { zone: string } | { zone: string }[] | null }
  for (const l of (links ?? []) as { ask_id: string; test_cases: Linked | Linked[] | null }[]) {
    const tc = Array.isArray(l.test_cases) ? l.test_cases[0] : l.test_cases
    if (!tc) continue
    cases.set(l.ask_id, [...(cases.get(l.ask_id) ?? []), tc.tc_id])
    const zone = (Array.isArray(tc.areas) ? tc.areas[0] : tc.areas)?.zone
    if (zone) zones.set(l.ask_id, (zones.get(l.ask_id) ?? new Set()).add(zone))
    const sp = sprintOfArea.get(tc.area_id)
    if (sp) askSprints.set(l.ask_id, (askSprints.get(l.ask_id) ?? new Map()).set(sp.name, sp.starts_on))
  }
  return rows.map((r) => ({
    key: r.key, kind: r.kind, title: r.title, zone: askZone(zones.get(r.id), r.title),
    sprint: [...(askSprints.get(r.id) ?? new Map<string, string>())].sort((a, b) => a[1].localeCompare(b[1])).map(([n]) => n).join(', ') || null, detail: r.detail, need_key: r.need_key, store: r.store, options: r.options,
    owner: r.owner_id ? name.get(r.owner_id) ?? null : null, due_on: r.due_on, state: r.state, status: askStatus(r.kind, r.state, r.outcome, r.suite_need),
    answer: r.answer, outcome: r.outcome, outcome_label: r.state === 'open' ? null : OUTCOME_LABEL[r.outcome ?? 'replied'] ?? null,
    closed_by: r.closed_by ? name.get(r.closed_by) ?? null : null, closed_at: r.closed_at ?? null,
    suite_need: r.state === 'open' ? r.suite_need ?? null : null, handed_from: r.handed_from_id ? name.get(r.handed_from_id) ?? null : null,
    duplicate_of: r.duplicate_of ? dupKey.get(r.duplicate_of) ?? null : null, ticket: r.ticket_id ? key.get(r.ticket_id) ?? null : null,
    cases: (cases.get(r.id) ?? []).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), cases_waiting: r.state === 'open' ? cases.get(r.id)?.length ?? 0 : 0,
    created_by: r.created_by ? name.get(r.created_by) ?? null : null, resolved_by: r.resolved_by ? name.get(r.resolved_by) ?? null : null,
    resolved_at: r.resolved_at, created_at: r.created_at, updated_at: r.updated_at,
  }))
}

const zoneIn = (rel: unknown): string => {
  const a = (Array.isArray(rel) ? rel[0] : rel) as { zone?: string } | null | undefined
  return a?.zone ?? ''
}

// The inbox --------------------------------------------------------------------------------------

export type InboxItem = { type: string; title: string; href: string; zone?: string; detail?: string; due_on?: string | null; overdue?: boolean; count?: number }
const today = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10)

/**
 * What waits on one person, most urgent first: asks they own, open tickets they own (each Critical
 * and High one, the rest counted), retests of tickets they own or whose cases they test, and pages
 * whose cases need detail or a rewrite. The people on oversight (Admin > Email) also see what is
 * overdue or has no owner, "not automatable" proposals to approve, retests nobody gets, and a
 * runner that has failed or stalled.
 */
export async function loadInbox(db: Db, person: { id: string; role: string }): Promise<InboxItem[]> {
  const lead = (await oversightIds(db)).includes(person.id)
  const now = today()
  const [{ data: asks }, { data: retests }, { data: pages }, { data: people }] = await Promise.all([
    db.from('asks').select('id, key, kind, title, owner_id, due_on, created_at, suite_need, handed_from_id, ask_cases(test_cases(areas(zone)))').eq('state', 'open'),
    db.from('tickets').select('key, title, state, severity, areas(zone)').in('state', ['new', 'triaged', 'in_fix', 'reopened', 'ready_for_retest']).eq('owner_id', person.id),
    db.from('areas').select('id, zone, page, owner_id').eq('owner_id', person.id),
    db.from('people').select('id, name'),
  ])
  const name = new Map((people ?? []).map((p) => [p.id, p.name]))
  const items: InboxItem[] = []
  // Asks this person raised that their owners answered: check, then close or send back.
  const { data: answered } = await db.from('asks').select('key, title, outcome, resolved_by').eq('state', 'answered').eq('created_by', person.id).order('resolved_at')
  for (const a of answered ?? []) items.push({ type: 'close', title: `Check and close ${a.key}: ${a.title}`, href: `/asks/${a.key}`,
    detail: `${OUTCOME_LABEL[a.outcome as keyof typeof OUTCOME_LABEL] ?? 'Answered'}${a.resolved_by ? ` by ${name.get(a.resolved_by) ?? 'someone'}` : ''}` })
  for (const a of asks ?? []) {
    const overdue = !!a.due_on && a.due_on < now
    const mine = a.owner_id === person.id
    if (mine || (lead && (overdue || !a.owner_id))) {
      const fromCases = new Set(((a.ask_cases ?? []) as unknown as { test_cases: unknown }[]).map((l) => zoneIn((Array.isArray(l.test_cases) ? l.test_cases[0] : l.test_cases as { areas?: unknown } | null)?.areas)).filter(Boolean))
      items.push({ type: a.kind, title: `${a.key}: ${a.title}`, href: `/asks/${a.key}`, zone: askZone(fromCases, a.title), due_on: a.due_on, overdue,
        detail: mine ? (a.suite_need ? `Suite change: ${a.suite_need}` : a.handed_from_id ? `${name.get(a.handed_from_id) ?? 'Someone'} handed it to you until you reply` : undefined)
          : !a.owner_id ? 'No owner yet' : `Overdue with ${name.get(a.owner_id) ?? 'someone'}` })
    }
  }
  // Tickets they own: each Critical and High one by name, the rest as one line to the list.
  const STATE: Record<string, string> = { new: 'not started', triaged: 'triaged', in_fix: 'in fix', reopened: 'reopened' }
  const mine = (retests ?? []).filter((t) => t.state !== 'ready_for_retest')
  const SEV = ['Critical', 'High', 'Medium', 'Low']
  const urgent = mine.filter((t) => t.severity === 'Critical' || t.severity === 'High').sort((a, b) => SEV.indexOf(a.severity) - SEV.indexOf(b.severity))
  for (const t of urgent) items.push({ type: 'ticket', title: `${t.key}: ${t.title}`, href: `/tickets/${encodeURIComponent(t.key)}`, zone: zoneIn(t.areas), detail: `${t.severity} · ${STATE[t.state] ?? t.state}` })
  const rest = mine.length - urgent.length
  if (rest) {
    const { data: me } = await db.from('people').select('name').eq('id', person.id).maybeSingle()
    items.push({ type: 'ticket', title: `${urgent.length ? `${rest} more` : rest} open ticket${rest === 1 ? '' : 's'} assigned to you`, href: `/tickets?view=grid&state=open&owner=${encodeURIComponent(me?.name ?? '')}`, count: rest,
      detail: Object.entries(mine.filter((t) => !urgent.includes(t)).reduce<Record<string, number>>((m, t) => ({ ...m, [STATE[t.state] ?? t.state]: (m[STATE[t.state] ?? t.state] ?? 0) + 1 }), {})).map(([k, n]) => `${n} ${k}`).join(' · ') })
  }
  // Retests: tickets ready for retest that they own, or whose test case they test. A developer's
  // own ticket that is ready for retest waits on QA, not on them.
  if (person.role !== 'dev') {
    const owned = (retests ?? []).filter((x) => x.state === 'ready_for_retest')
    const { data: tested } = await db.from('test_cases').select('id').eq('tester_id', person.id)
    const caseIds = (tested ?? []).map((c) => c.id as string)
    const { data: viaCase } = caseIds.length
      ? await db.from('tickets').select('key, title, severity, areas(zone)').eq('state', 'ready_for_retest').in('case_id', caseIds)
      : { data: [] }
    // Tickets with no test case carry their own tester.
    const { data: ownTester } = await db.from('tickets').select('key, title, severity, areas(zone)').eq('state', 'ready_for_retest').is('case_id', null).eq('tester_id', person.id)
    const toRetest = [...owned, ...[...(viaCase ?? []), ...(ownTester ?? [])].filter((t, i, all) => !owned.some((o) => o.key === t.key) && all.findIndex((x) => x.key === t.key) === i)]
      .sort((a, b) => SEV.indexOf(a.severity) - SEV.indexOf(b.severity))
    const named = toRetest.length > 10 ? toRetest.filter((t) => t.severity === 'Critical' || t.severity === 'High') : toRetest
    for (const t of named) items.push({ type: 'retest', title: `Retest ${t.key}: ${t.title}`, href: `/tickets/${encodeURIComponent(t.key)}`, zone: zoneIn(t.areas), detail: t.severity })
    const more = toRetest.length - named.length
    if (more) {
      const { data: me } = await db.from('people').select('name').eq('id', person.id).maybeSingle()
      items.push({ type: 'retest', title: `${named.length ? `${more} more` : more} ticket${more === 1 ? '' : 's'} ready for you to retest`, href: `/tickets?view=grid&state=ready_for_retest&tester=${encodeURIComponent(me?.name ?? '')}`, count: more })
    }
  }
  // Pages this person writes: cases whose Expected is a placeholder.
  const pageIds = (pages ?? []).map((p) => p.id)
  if (pageIds.length) {
    const { data: thin } = await db.from('test_cases').select('area_id').eq('needs_detail', true).in('area_id', pageIds)
    for (const p of pages ?? []) {
      const n = (thin ?? []).filter((c) => c.area_id === p.id).length
      if (n) items.push({ type: 'detail', title: `Complete the Expected result on ${p.zone} · ${p.page}`, href: `/cases?area=${p.id}&needs_detail=1`, zone: p.zone, count: n, detail: `${n} case${n === 1 ? '' : 's'} with placeholder text` })
    }
  }
  // A page this person writes that failed in the latest full run after passing in the one before.
  if (pageIds.length) {
    const { data: full } = await db.from('suite_runs').select('run_id, started_at').eq('kind', 'full').not('finished_at', 'is', null).order('started_at', { ascending: false }).limit(2)
    if (full?.length === 2) {
      const [now, before] = full
      const read = async (runId: string) => (await db.from('test_runs').select('case_id, result, test_cases!inner(area_id)').eq('run_id', runId).eq('kind', 'auto').in('test_cases.area_id', pageIds).limit(5000)).data ?? []
      const [a, b] = await Promise.all([read(now.run_id), read(before.run_id)])
      const passedBefore = new Set(b.filter((r) => r.result === 'passed').map((r) => r.case_id))
      const regressed = a.filter((r) => r.result === 'failed' && passedBefore.has(r.case_id))
      if (regressed.length) items.push({ type: 'run', title: `${regressed.length} case${regressed.length === 1 ? '' : 's'} on your pages failed in the latest full run after passing before`, href: `/cases/runs/${encodeURIComponent(now.run_id)}`, count: regressed.length, overdue: true })
    }
  }
  if (lead) {
    // Runs that went wrong in the last two days, and one still going past its expected end.
    const { data: runs } = await db.from('suite_runs').select('run_id, exit, confounded, finished_at, eta, started_at').gte('started_at', new Date(Date.now() - 2 * 864e5).toISOString())
    for (const r of runs ?? []) {
      const href = `/cases/runs/${encodeURIComponent(r.run_id)}`
      if (r.exit === 'killed' || r.exit === 'refused' || r.exit === 'gave_up') items.push({ type: 'run', title: `Run ${r.run_id} ${r.exit === 'refused' ? 'was refused at the gates' : r.exit === 'killed' ? 'was killed' : 'gave up'}`, href, overdue: true })
      else if (r.confounded) items.push({ type: 'run', title: `Run ${r.run_id} is confounded: the bundle changed mid-run`, href })
      if (!r.finished_at && r.eta && r.eta < new Date().toISOString()) items.push({ type: 'run', title: `Run ${r.run_id} is still going past its expected end`, href })
    }
    // Retests nobody gets: ready for retest with no tester, the case's or (with no case) the ticket's own.
    const { data: orphans } = await db.from('ticket_list').select('key').eq('state', 'ready_for_retest').is('tester_id', null)
    if (orphans?.length) items.push({ type: 'retest', title: `${orphans.length} ticket${orphans.length === 1 ? ' is' : 's are'} ready for retest with no tester`, href: '/tickets?view=grid&state=ready_for_retest&tester=No%20tester', count: orphans.length, detail: 'Give them a tester so the retest reaches someone' })
    const { count } = await db.from('test_cases').select('id', { count: 'exact', head: true }).not('automation_proposed', 'is', null)
    if (count) items.push({ type: 'approve', title: `Approve or turn down ${count} "not automatable" proposal${count === 1 ? '' : 's'}`, href: '/cases/automation#proposals', count })
    items.push(...await runnerAlerts(db))
  }
  const rank = (i: InboxItem) => (i.overdue ? 0 : i.due_on ? 1 : 2)
  return items.sort((a, b) => rank(a) - rank(b) || (a.due_on ?? '9').localeCompare(b.due_on ?? '9'))
}

/** A runner whose last batch failed, that has gone quiet, or sits idle with work waiting. */
export async function runnerAlerts(db: Db): Promise<InboxItem[]> {
  const [{ data: status }, { data: failed }] = await Promise.all([
    db.from('runner_status').select('state, batch, backlog, since, heartbeat_at, ci_tokens(label)'),
    db.from('runner_events').select('batch, detail, at').eq('kind', 'batch_failed').gte('at', new Date(Date.now() - 864e5).toISOString()).order('at', { ascending: false }).limit(1),
  ])
  const out: InboxItem[] = []
  if (failed?.length) out.push({ type: 'runner', title: `Runner batch failed${failed[0].batch ? `: ${failed[0].batch}` : ''}`, href: '/cases/automation', detail: failed[0].detail ?? undefined, overdue: true })
  for (const s of status ?? []) {
    const quiet = Date.now() - Date.parse(s.heartbeat_at) > 2 * 3600_000
    const idle = s.state === 'idle' && (s.backlog ?? 0) > 0 && !!s.since && Date.now() - Date.parse(s.since) > 3600_000
    if (quiet) out.push({ type: 'runner', title: 'The runner has not checked in for over 2 hours', href: '/cases/automation', overdue: true })
    else if (idle) out.push({ type: 'runner', title: `The runner is idle with ${s.backlog} cases waiting`, href: '/cases/automation' })
    else if (s.state === 'cluster_down') out.push({ type: 'runner', title: 'The runner reports the cluster is down', href: '/cases/automation', overdue: true })
  }
  return out
}

/** Every page's screen hold, and whether it is on. */
export async function loadHolds(db: Db) {
  const { data } = await db.from('areas').select('id, zone, page, automation_hold_reason, automation_hold_until, automation_hold_ticket_id')
    .or('automation_hold_ticket_id.not.is.null,automation_hold_until.not.is.null,automation_hold_reason.not.is.null')
  const ids = (data ?? []).map((a) => a.automation_hold_ticket_id).filter(Boolean) as string[]
  const { data: tickets } = ids.length ? await db.from('tickets').select('id, key, state').in('id', ids) : { data: [] }
  const byId = new Map((tickets ?? []).map((t) => [t.id as string, t as { key: string; state: string }]))
  const now = today()
  return (data ?? []).map((a) => {
    const t = a.automation_hold_ticket_id ? byId.get(a.automation_hold_ticket_id) ?? null : null
    return { id: a.id as string, zone: a.zone as string, page: a.page as string, defect: t?.key ?? null, defect_state: t?.state ?? null,
      reason: a.automation_hold_reason as string | null, until: a.automation_hold_until as string | null,
      active: holdActive({ hasTicket: !!a.automation_hold_ticket_id, ticketState: t?.state, until: a.automation_hold_until }, now) }
  })
}

export { ticketId, caseIds }

/** Who gets the oversight items (Admin > Email); until it is set, the leads. */
export async function oversightIds(db: Db): Promise<string[]> {
  const { data } = await db.from('app_settings').select('value').eq('key', 'oversight').maybeSingle()
  const ids = (data?.value as { people?: string[] } | null)?.people
  if (ids) return ids
  const { data: leads } = await db.from('people').select('id').eq('role', 'lead').eq('active', true)
  return (leads ?? []).map((p) => p.id as string)
}
