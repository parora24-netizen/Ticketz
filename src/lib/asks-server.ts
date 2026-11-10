import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { askStatus, holdActive, type AskKind, type AskState, type Outcome } from '@/lib/automation-loop'
import { casesByAnyId, currentTicketKey } from '@/lib/ids'
import { fixSprintForArea } from '@/lib/workflow/fix-sprint'
import { emailAboutAsk } from '@/lib/email'

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
      options: input.options ?? null, owner_id: owner?.id ?? null, due_on: input.due_on ?? null, ticket_id: ticket,
      created_by: actor.personId, created_via: actor.tokenId ?? null,
    }).select('id, key').single()
    if (error) return { error: error.message, status: 500 }
    ask = data
  }
  if (ids.length) {
    const { error } = await db.from('ask_cases').upsert(ids.map((case_id) => ({ ask_id: ask!.id, case_id })), { ignoreDuplicates: true })
    if (error) return { error: error.message, status: 500 }
  }
  if (!open && owner && 'id' in owner) await emailAboutAsk(ask.key, 'assigned', actor.personId)
  return { key: ask.key, created: !open, cases_linked: ids.length, unmatched }
}

type PatchInput = { title?: string; detail?: string | null; state?: AskState; answer?: string | null; outcome?: Outcome | null; store?: string | null; owner?: string | null; due_on?: string | null; add_cases?: string[]; remove_cases?: string[] }

export async function patchAsk(db: Db, key: string, p: PatchInput, actor: Actor, dryRun = false) {
  const { data: ask } = await db.from('asks').select('*').eq('key', key.toUpperCase()).maybeSingle()
  if (!ask) return { error: `No ask ${key}`, status: 404 }
  const a = ask as AskRow
  const owner = p.owner ? await personByName(db, p.owner) : null
  if (owner && 'error' in owner) return { error: owner.error, status: 400 }
  if (p.outcome && a.kind !== 'decision') return { error: 'Only a decision has an outcome', status: 400 }
  if (a.kind === 'decision' && p.state === 'done' && !(p.outcome ?? a.outcome)) return { error: 'Say which outcome was decided: retire, rewrite, restore or other', status: 400 }
  const fields = Object.fromEntries(Object.entries({
    title: p.title, detail: p.detail, state: p.state, answer: p.answer, outcome: p.outcome, store: p.store, due_on: p.due_on,
    owner_id: p.owner === undefined ? undefined : owner && 'id' in owner ? owner.id : null,
  }).filter(([, v]) => v !== undefined))
  const add = await caseIds(db, p.add_cases ?? []), remove = await caseIds(db, p.remove_cases ?? [])
  if (dryRun) return { key: a.key, changes: fields, add_cases: add.ids.length, remove_cases: remove.ids.length, unmatched: [...add.unmatched, ...remove.unmatched], dry_run: true }
  if (Object.keys(fields).length) {
    const { error } = await db.from('asks').update(fields).eq('id', a.id)
    if (error) return { error: error.message, status: 500 }
  }
  if (add.ids.length) await db.from('ask_cases').upsert(add.ids.map((case_id) => ({ ask_id: a.id, case_id })), { ignoreDuplicates: true })
  if (remove.ids.length) await db.from('ask_cases').delete().eq('ask_id', a.id).in('case_id', remove.ids)
  let effect: string | undefined
  if (a.kind === 'decision' && p.state === 'done' && a.state !== 'done') effect = await applyOutcome(db, { ...a, ...fields } as AskRow, actor)
  if (fields.owner_id && fields.owner_id !== a.owner_id) await emailAboutAsk(a.key, 'assigned', actor.personId)
  if (p.state && p.state !== 'open' && a.state === 'open') await emailAboutAsk(a.key, 'answered', actor.personId)
  return { key: a.key, effect }
}

/**
 * What a decision does to its cases: retire makes them "not automatable" (recorded as decided by
 * the person deciding), restore opens the defect that brings the control back, rewrite leaves them
 * for their page's writer, whose inbox shows them until the text changes.
 */
export async function applyOutcome(db: Db, a: AskRow, actor: Actor): Promise<string> {
  const { data: links } = await db.from('ask_cases').select('case_id').eq('ask_id', a.id)
  const ids = (links ?? []).map((l) => l.case_id as string)
  if (a.outcome === 'retire') {
    if (!ids.length) return 'No cases to retire'
    const { error } = await db.from('test_cases').update({
      automation: 'manual_only', automation_proposed: null, automation_decided_by: actor.personId, automation_decided_at: new Date().toISOString(),
      automation_note: `Retired by ${a.key}: ${a.title}`.slice(0, 2000),
    }).in('id', ids)
    return error ? `Could not retire the cases: ${error.message}` : `${ids.length} case${ids.length === 1 ? '' : 's'} set to not automatable`
  }
  if (a.outcome === 'restore') {
    if (a.ticket_id) {
      const { data: t } = await db.from('tickets').select('key, state').eq('id', a.ticket_id).maybeSingle()
      if (t && t.state === 'closed') {
        const { error } = await db.from('tickets').update({ state: 'reopened' }).eq('id', a.ticket_id)
        return error ? `Could not reopen ${t.key}: ${error.message}` : `${t.key} reopened`
      }
      return t ? `${t.key} is already open` : 'Its ticket is gone'
    }
    const { data: c } = ids.length ? await db.from('test_cases').select('id, priority, area_id').in('id', ids).limit(1).maybeSingle() : { data: null }
    const [{ data: sprints }, { data: sprintAreas }] = await Promise.all([db.from('sprints').select('id, name, kind, status, starts_on'), c ? db.from('sprint_areas').select('sprint_id, area_id').eq('area_id', c.area_id) : Promise.resolve({ data: [] })])
    const fix = c ? fixSprintForArea(c.area_id, sprints ?? [], sprintAreas ?? []) : null
    const { data: key, error: keyError } = await db.rpc('next_ticket_key', { prefix: 'DEV' })
    if (keyError) return `Could not open a ticket: ${keyError.message}`
    const { data: t, error } = await db.from('tickets').insert({
      key, kind: 'defect', case_id: c?.id ?? null, title: `Restore: ${a.title}`.slice(0, 300), description: [a.detail, a.answer].filter(Boolean).join('\n\n') || null,
      severity: c?.priority ?? 'Medium', current_sprint_id: fix?.id ?? null, created_by: actor.personId,
    }).select('id').single()
    if (error) return `Could not open a ticket: ${error.message}`
    await db.from('asks').update({ ticket_id: t.id }).eq('id', a.id)
    return `${key} opened`
  }
  return a.outcome === 'rewrite' ? 'Waiting on the page writer to rewrite the cases' : 'Recorded'
}

/** Asks as the API shows them: names, not ids; the cases waiting on each. */
export async function askJson(db: Db, rows: AskRow[]) {
  const ids = rows.map((r) => r.id)
  const [{ data: people }, { data: links }, { data: tickets }] = await Promise.all([
    db.from('people').select('id, name'),
    ids.length ? db.from('ask_cases').select('ask_id, test_cases(tc_id)').in('ask_id', ids) : Promise.resolve({ data: [] }),
    db.from('tickets').select('id, key').in('id', rows.map((r) => r.ticket_id).filter(Boolean) as string[]),
  ])
  const name = new Map((people ?? []).map((p) => [p.id, p.name]))
  const key = new Map((tickets ?? []).map((t) => [t.id, t.key]))
  const cases = new Map<string, string[]>()
  for (const l of (links ?? []) as { ask_id: string; test_cases: { tc_id: string } | { tc_id: string }[] | null }[]) {
    const tc = Array.isArray(l.test_cases) ? l.test_cases[0] : l.test_cases
    if (tc) cases.set(l.ask_id, [...(cases.get(l.ask_id) ?? []), tc.tc_id])
  }
  return rows.map((r) => ({
    key: r.key, kind: r.kind, title: r.title, detail: r.detail, need_key: r.need_key, store: r.store, options: r.options,
    owner: r.owner_id ? name.get(r.owner_id) ?? null : null, due_on: r.due_on, state: r.state, status: askStatus(r.kind, r.state),
    answer: r.answer, outcome: r.outcome, ticket: r.ticket_id ? key.get(r.ticket_id) ?? null : null,
    cases: (cases.get(r.id) ?? []).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })), cases_waiting: r.state === 'open' ? cases.get(r.id)?.length ?? 0 : 0,
    created_by: r.created_by ? name.get(r.created_by) ?? null : null, resolved_by: r.resolved_by ? name.get(r.resolved_by) ?? null : null,
    resolved_at: r.resolved_at, created_at: r.created_at, updated_at: r.updated_at,
  }))
}

// The inbox --------------------------------------------------------------------------------------

export type InboxItem = { type: string; title: string; href: string; detail?: string; due_on?: string | null; overdue?: boolean; count?: number }
const today = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10)
const STALE_PR_DAYS = 3

/**
 * What waits on one person, most urgent first: asks they own, retests of tickets they own, pull
 * requests to review, pages whose cases need detail or a rewrite. The lead also sees what is overdue
 * or has no owner, "not automatable" proposals to approve, and a runner that has failed or stalled.
 */
export async function loadInbox(db: Db, person: { id: string; role: string }): Promise<InboxItem[]> {
  const lead = person.role === 'lead'
  const now = today()
  const [{ data: asks }, { data: retests }, { data: prs }, { data: pages }, { data: people }] = await Promise.all([
    db.from('asks').select('id, key, kind, title, owner_id, due_on, created_at').eq('state', 'open'),
    db.from('tickets').select('key, title').eq('state', 'ready_for_retest').eq('owner_id', person.id),
    db.from('automation_prs').select('key, url, title, reviewer_id, opened_at, pr_cases(case_id)').eq('state', 'open'),
    db.from('areas').select('id, zone, page, owner_id').eq('owner_id', person.id),
    db.from('people').select('id, name'),
  ])
  const name = new Map((people ?? []).map((p) => [p.id, p.name]))
  const items: InboxItem[] = []
  for (const a of asks ?? []) {
    const overdue = !!a.due_on && a.due_on < now
    const mine = a.owner_id === person.id
    if (mine || (lead && (overdue || !a.owner_id))) {
      items.push({ type: a.kind, title: `${a.key}: ${a.title}`, href: `/asks/${a.key}`, due_on: a.due_on, overdue,
        detail: mine ? undefined : !a.owner_id ? 'No owner yet' : `Overdue with ${name.get(a.owner_id) ?? 'someone'}` })
    }
  }
  for (const t of retests ?? []) items.push({ type: 'retest', title: `Retest ${t.key}: ${t.title}`, href: `/tickets/${encodeURIComponent(t.key)}` })
  for (const pr of prs ?? []) {
    const days = Math.floor((Date.now() - Date.parse(pr.opened_at)) / 864e5)
    const cases = (pr.pr_cases as unknown[] | null)?.length ?? 0
    if (pr.reviewer_id === person.id || (lead && (!pr.reviewer_id || days >= STALE_PR_DAYS))) {
      items.push({ type: 'pr', title: `Review ${pr.title ?? pr.key}`, href: pr.url ?? '/cases/automation', overdue: days >= STALE_PR_DAYS,
        detail: `${cases} case${cases === 1 ? '' : 's'} · open ${days} day${days === 1 ? '' : 's'}${pr.reviewer_id ? '' : ' · no reviewer'}` })
    }
  }
  // Pages this person writes: cases whose Expected is a placeholder, and cases a decision sent back to rewrite.
  const pageIds = (pages ?? []).map((p) => p.id)
  if (pageIds.length) {
    const { data: thin } = await db.from('test_cases').select('area_id').eq('needs_detail', true).in('area_id', pageIds)
    for (const p of pages ?? []) {
      const n = (thin ?? []).filter((c) => c.area_id === p.id).length
      if (n) items.push({ type: 'detail', title: `Complete the Expected result on ${p.zone} · ${p.page}`, href: `/cases?area=${p.id}&needs_detail=1`, count: n, detail: `${n} case${n === 1 ? '' : 's'} with placeholder text` })
    }
    const { data: rewrites } = await db.from('asks').select('key, title, resolved_at, ask_cases(test_cases(tc_id, area_id, text_updated_at))').eq('kind', 'decision').eq('outcome', 'rewrite').eq('state', 'done')
    for (const r of rewrites ?? []) {
      type Linked = { tc_id: string; area_id: string; text_updated_at: string }
      const waiting = ((r.ask_cases ?? []) as unknown as { test_cases: Linked | Linked[] | null }[])
        .map((l) => (Array.isArray(l.test_cases) ? l.test_cases[0] : l.test_cases))
        .filter((c): c is Linked => !!c && pageIds.includes(c.area_id) && c.text_updated_at < (r.resolved_at ?? ''))
      if (waiting.length) items.push({ type: 'rewrite', title: `Rewrite the cases ${r.key} sent back: ${r.title}`, href: `/asks/${r.key}`, count: waiting.length })
    }
  }
  if (lead) {
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
