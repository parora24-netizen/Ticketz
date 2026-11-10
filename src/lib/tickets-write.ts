import 'server-only'
import { addComment, raiseTicket, ticketUrl, type Caller } from '@/lib/ci-api'
import { currentSprint, type Sprint } from '@/lib/data'
import { casesByAnyId, currentTicketKey } from '@/lib/ids'
import { failureText } from '@/lib/tickets-api'
import { splitArea, type TicketChange, type TicketCreate } from '@/lib/tickets-schema'
import { fixSprintForArea } from '@/lib/workflow/fix-sprint'
import { allowedMoves, canMove, requiredFor, type Role, type TicketState } from '@/lib/workflow/ticket-machine'

/**
 * Creating and changing tickets through the API, by the same rules as the app: state changes follow
 * the workflow for the token's person (a runner moves as QA), and every change is recorded as made
 * by that person. Names are resolved here, and anything unknown comes back as an error listing what
 * is valid, never dropped.
 */
type Db = Caller['db']
export type Failure = { error: string; status: number; allowed?: string[]; valid?: string[] }
const fail = (status: number, error: string, extra: Partial<Failure> = {}): Failure => ({ status, error, ...extra })
const isFailure = (x: unknown): x is Failure => !!x && typeof x === 'object' && 'error' in x && 'status' in x

async function person(db: Db, v: string): Promise<{ id: string; name: string } | Failure> {
  const { data } = await db.from('people').select('id, name').eq('active', true).order('name')
  const people = (data ?? []) as { id: string; name: string }[]
  const n = v.trim().toLowerCase()
  const hit = people.find((p) => p.id === v) ?? people.find((p) => p.name.toLowerCase() === n)
  return hit ?? fail(400, `No one called "${v}" on the team`, { valid: people.map((p) => p.name) })
}

async function area(db: Db, v: string): Promise<{ id: string; zone: string; page: string } | Failure> {
  const { data } = await db.from('areas').select('id, zone, page').neq('in_release', false)
  const areas = (data ?? []) as { id: string; zone: string; page: string }[]
  const want = splitArea(v)
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase()
  const hit = want ? areas.find((a) => same(a.zone, want.zone) && same(a.page, want.page)) : undefined
  return hit ?? fail(400, `No page "${v}"; send it as "Zone · Page"`, { valid: areas.map((a) => `${a.zone} · ${a.page}`) })
}

async function sprint(db: Db, v: string): Promise<Sprint | Failure> {
  const { data } = await db.from('sprints').select('*')
  const sprints = (data ?? []) as Sprint[]
  const hit = sprints.find((s) => s.name.toLowerCase() === v.trim().toLowerCase())
  if (hit?.status === 'closed') return fail(400, `${hit.name} has closed`, { valid: sprints.filter((s) => s.status !== 'closed').map((s) => s.name) })
  return hit ?? fail(400, `No sprint ${v}`, { valid: sprints.filter((s) => s.status !== 'closed').map((s) => s.name) })
}

async function ticketIds(db: Db, keys: string[]): Promise<Map<string, string> | Failure> {
  const out = new Map<string, string>()
  for (const k of keys) {
    const key = await currentTicketKey(db, k)
    const { data } = key ? await db.from('tickets').select('id').eq('key', key).maybeSingle() : { data: null }
    if (!data) return fail(404, `No ticket ${k}`)
    out.set(k, data.id)
  }
  return out
}

async function caseIds(db: Db, tcIds: string[]): Promise<{ id: string; area_id: string }[] | Failure> {
  const found = await casesByAnyId(db, tcIds)
  const missing = tcIds.filter((t) => !found.has(t.toUpperCase()))
  if (missing.length) return fail(404, `No test case ${missing.join(', ')}`)
  const ids = [...new Set([...found.values()].map((c) => c.id))]
  const { data } = await db.from('test_cases').select('id, area_id').in('id', ids)
  return ids.map((id) => (data ?? []).find((c) => c.id === id)!).filter(Boolean)
}

/** The role a token moves tickets as: its person's, or QA's for a runner or CI. */
async function roleOf(c: Caller): Promise<Role> {
  if (!c.actorId) return 'qa'
  const { data } = await c.db.from('people').select('role, active').eq('id', c.actorId).maybeSingle()
  return data?.active ? (data.role as Role) : 'qa'
}

// ---- Reading ------------------------------------------------------------------------------------

/** Tickets as the API returns them, in full. */
export async function ticketsJson(db: Db, ids: string[]) {
  if (!ids.length) return []
  const [{ data: rows }, { data: list }, { data: people }, { data: sprints }, { data: extra }, { data: links }] = await Promise.all([
    db.from('tickets').select('id, key, legacy_key, kind, title, description, state, severity, priority, owner_id, accountable_id, created_by, current_sprint_id, case_id, area_id, requirement_ids, defect_id, fixed_in_build, blocked_reason, defer_reason, duplicate_of, external_ref, logged_on, updated_at').in('id', ids),
    db.from('ticket_list').select('id, tc_id, zone, page').in('id', ids),
    db.from('people').select('id, name'),
    db.from('sprints').select('id, name'),
    db.from('ticket_cases').select('ticket_id, test_cases(tc_id)').in('ticket_id', ids),
    db.from('ticket_links').select('from_id, to_id, kind').or(`from_id.in.(${ids.join(',')}),to_id.in.(${ids.join(',')})`),
  ])
  const linked = [...new Set((links ?? []).flatMap((l) => [l.from_id, l.to_id]))]
  const { data: keys } = linked.length ? await db.from('tickets').select('id, key').in('id', [...linked, ...(rows ?? []).map((r) => r.duplicate_of).filter(Boolean)]) : { data: [] }
  const key = new Map((keys ?? []).map((k) => [k.id as string, k.key as string]))
  const name = new Map((people ?? []).map((p) => [p.id as string, p.name as string]))
  const sprintName = new Map((sprints ?? []).map((s) => [s.id as string, s.name as string]))
  const one = <T,>(v: unknown) => ((Array.isArray(v) ? v[0] : v) ?? null) as T | null
  return ids.map((id) => {
    const t = (rows ?? []).find((r) => r.id === id)
    if (!t) return null
    const l = (list ?? []).find((r) => r.id === id)
    const tcIds = [l?.tc_id, ...(extra ?? []).filter((e) => e.ticket_id === id).map((e) => one<{ tc_id: string }>(e.test_cases)?.tc_id)].filter((x): x is string => !!x)
    const out = (kind: string) => (links ?? []).filter((x) => x.from_id === id && x.kind === kind).map((x) => key.get(x.to_id)).filter(Boolean)
    return {
      key: t.key, legacy_key: t.legacy_key, kind: t.kind, title: t.title, description: t.description, state: t.state,
      severity: t.severity, priority: t.priority,
      owner: t.owner_id ? name.get(t.owner_id) ?? null : null, accountable: t.accountable_id ? name.get(t.accountable_id) ?? null : null,
      created_by: t.created_by ? name.get(t.created_by) ?? null : null,
      area: l?.zone ? `${l.zone} · ${l.page}` : null, sprint: t.current_sprint_id ? sprintName.get(t.current_sprint_id) ?? null : null,
      tc_id: l?.tc_id ?? null, tc_ids: [...new Set(tcIds)], requirement_ids: t.requirement_ids ?? [],
      defect_id: t.defect_id, fixed_in_build: t.fixed_in_build, blocked: t.blocked_reason, defer_reason: t.defer_reason,
      duplicate_of: t.duplicate_of ? key.get(t.duplicate_of) ?? null : null, external_ref: t.external_ref,
      depends_on: out('depends_on'), related: out('related'), parent: out('parent')[0] ?? null,
      blocks: (links ?? []).filter((x) => x.to_id === id && x.kind === 'depends_on').map((x) => key.get(x.from_id)).filter(Boolean),
      children: (links ?? []).filter((x) => x.to_id === id && x.kind === 'parent').map((x) => key.get(x.from_id)).filter(Boolean),
      logged_on: t.logged_on, updated_at: t.updated_at, url: ticketUrl(t.key),
    }
  }).filter(Boolean)
}

// ---- Changing -----------------------------------------------------------------------------------

/** Replaces a ticket's links of the kinds given. */
async function setLinks(db: Db, ticketId: string, p: { depends_on?: string[]; related?: string[]; parent?: string | null }): Promise<Failure | null> {
  for (const kind of ['depends_on', 'related', 'parent'] as const) {
    const v = p[kind]
    if (v === undefined) continue
    const keys = kind === 'parent' ? (v ? [v as string] : []) : (v as string[])
    const ids = await ticketIds(db, keys)
    if (isFailure(ids)) return ids
    if ([...ids.values()].includes(ticketId)) return fail(400, 'A ticket cannot link to itself')
    await db.from('ticket_links').delete().eq('from_id', ticketId).eq('kind', kind)
    if (ids.size) {
      const { error } = await db.from('ticket_links').insert([...ids.values()].map((to_id) => ({ from_id: ticketId, to_id, kind })))
      if (error) return fail(500, error.message)
    }
  }
  return null
}

type Row = { id: string; key: string; state: TicketState; case_id: string | null; area_id: string | null; fixed_in_build: string | null; owner_id: string | null }

/** One ticket's change. Nothing is saved when any part of it is refused. */
export async function changeTicket(c: Caller, keyAsked: string, p: TicketChange, dryRun = false) {
  const key = await currentTicketKey(c.db, keyAsked)
  const { data: t } = key ? await c.db.from('tickets').select('id, key, state, case_id, area_id, fixed_in_build, owner_id').eq('key', key).maybeSingle() : { data: null }
  if (!t) return fail(404, `No ticket ${keyAsked}`)
  const row = t as Row
  const set: Record<string, unknown> = {}
  if (p.title !== undefined) set.title = p.title
  if (p.description !== undefined) set.description = p.description
  if (p.severity !== undefined) set.severity = p.severity
  if (p.priority !== undefined) set.priority = p.priority
  if (p.fixed_in_build !== undefined) set.fixed_in_build = p.fixed_in_build
  if (p.defect_id !== undefined) set.defect_id = p.defect_id
  if (p.requirement_ids !== undefined) set.requirement_ids = p.requirement_ids
  if (p.external_ref !== undefined) set.external_ref = p.external_ref
  if (p.blocked !== undefined) { set.blocked_reason = p.blocked; set.blocked_at = p.blocked ? new Date().toISOString() : null }
  for (const [field, col] of [['owner', 'owner_id'], ['accountable', 'accountable_id']] as const) {
    const v = p[field]
    if (v === undefined) continue
    if (v === null) { set[col] = null; continue }
    const who = await person(c.db, v)
    if (isFailure(who)) return who
    set[col] = who.id
  }
  if (p.area !== undefined) {
    if (p.area === null) set.area_id = null
    else {
      const a = await area(c.db, p.area)
      if (isFailure(a)) return a
      set.area_id = a.id
    }
  }
  if (p.sprint !== undefined) {
    if (p.sprint === null) set.current_sprint_id = null
    else {
      const s = await sprint(c.db, p.sprint)
      if (isFailure(s)) return s
      set.current_sprint_id = s.id
    }
  }
  if (p.state && p.state !== row.state) {
    const role = await roleOf(c)
    if (!canMove(row.state, p.state, role)) {
      return fail(409, `A ${role === 'qa' ? 'QA' : role} token cannot move ${row.key} from ${row.state} to ${p.state}`, { allowed: allowedMoves(row.state, role) })
    }
    const needs = requiredFor(p.state)
    if (needs === 'fixed_in_build' && !(p.fixed_in_build ?? row.fixed_in_build)) return fail(400, 'ready_for_retest needs fixed_in_build')
    if (needs === 'defer_reason' && !p.defer_reason) return fail(400, 'deferred needs defer_reason')
    if (needs === 'duplicate_of') {
      if (!p.duplicate_of) return fail(400, 'duplicate needs duplicate_of, the ticket it duplicates')
      const dup = await ticketIds(c.db, [p.duplicate_of])
      if (isFailure(dup)) return dup
      set.duplicate_of = dup.get(p.duplicate_of)
    }
    if (p.defer_reason) set.defer_reason = p.defer_reason
    set.state = p.state
  }
  const cases = p.tc_ids ? await caseIds(c.db, p.tc_ids) : null
  if (isFailure(cases)) return cases
  if (dryRun) return { key: row.key, would_change: Object.keys(set).concat(p.tc_ids ? ['tc_ids'] : [], ['depends_on', 'related', 'parent'].filter((k) => k in p)), dry_run: true }

  if (Object.keys(set).length) {
    const { error } = await c.db.from('tickets').update(set).eq('id', row.id)
    if (error) return fail(400, error.message)
  }
  if (cases) {
    await c.db.from('ticket_cases').delete().eq('ticket_id', row.id)
    const extra = cases.filter((x) => x.id !== row.case_id)
    if (extra.length) await c.db.from('ticket_cases').insert(extra.map((x) => ({ ticket_id: row.id, case_id: x.id })))
  }
  const linkError = await setLinks(c.db, row.id, p)
  if (linkError) return linkError
  return { key: row.key, ticket: (await ticketsJson(c.db, [row.id]))[0] }
}

// ---- Creating -----------------------------------------------------------------------------------

/**
 * A new ticket, filled in completely in one call. With external_ref, posting the same ref again
 * (from the same token) updates that ticket instead. A failing case's defect or mismatch keeps the
 * one-open-ticket-per-case rule: a repeat is added to the open ticket as a comment.
 */
export async function createTicket(c: Caller, p: TicketCreate, dryRun = false) {
  if (p.external_ref) {
    const { data: same } = await c.db.from('tickets').select('key').eq('created_via', c.tokenId).eq('external_ref', p.external_ref).maybeSingle()
    if (same) {
      const { kind: _k, tc_id: _t, zone: _z, page: _p, build: _b, run_id: _r, error: _e, url: _u, ...rest } = p
      const res = await changeTicket(c, same.key, { ...rest, external_ref: undefined } as TicketChange, dryRun)
      return isFailure(res) ? res : { ...res, created: false, updated: true }
    }
  }
  const tcIds = [...new Set([p.tc_id, ...(p.tc_ids ?? [])].filter((x): x is string => !!x))]
  const cases = tcIds.length ? await caseIds(c.db, tcIds) : []
  if (isFailure(cases)) return cases
  const owner = p.owner ? await person(c.db, p.owner) : null
  if (isFailure(owner)) return owner
  const accountable = p.accountable ? await person(c.db, p.accountable) : null
  if (isFailure(accountable)) return accountable
  const page = p.area ? await area(c.db, p.area) : p.page ? await area(c.db, `${p.zone ?? ''} · ${p.page}`) : null
  if (isFailure(page)) return page
  const chosen = p.sprint ? await sprint(c.db, p.sprint) : null
  if (isFailure(chosen)) return chosen
  if (dryRun) return { key: null, created: true, dry_run: true, cases: cases.length }

  // A failing case's ticket: one open per case, as the suite has always had it.
  if (p.kind !== 'task' && cases.length === 1 && !p.external_ref && (p.build || p.run_id || p.error)) {
    const res = await raiseTicket(c, { tc_id: tcIds[0], kind: p.kind === 'test_mismatch' ? 'test_mismatch' : 'defect', title: p.title, description: p.description, severity: p.severity, build: p.build, run_id: p.run_id, error: p.error, url: p.url, defect_id: p.defect_id })
    if ('error' in res) return fail(res.status, res.error)
    if (!res.created) return { key: res.key, created: false, reopened: res.reopened ?? false, ticket: (await ticketsJson(c.db, [(await c.db.from('tickets').select('id').eq('key', res.key).single()).data!.id]))[0] }
    const extra: TicketChange = Object.fromEntries(Object.entries({ owner: p.owner, accountable: p.accountable, area: p.area, sprint: p.sprint, priority: p.priority, requirement_ids: p.requirement_ids, depends_on: p.depends_on, related: p.related, parent: p.parent, blocked: p.blocked }).filter(([, v]) => v !== undefined)) as TicketChange
    const changed = Object.keys(extra).length ? await changeTicket(c, res.key, extra) : null
    if (isFailure(changed)) return changed
    const { data: made } = await c.db.from('tickets').select('id').eq('key', res.key).single()
    if (made) await c.db.from('tickets').update({ created_via: c.tokenId }).eq('id', made.id)
    return { key: res.key, created: true, ticket: (await ticketsJson(c.db, [made!.id]))[0] }
  }

  const areaId = page?.id ?? cases[0]?.area_id ?? null
  const { data: sprintRows } = await c.db.from('sprints').select('*')
  const sprints = (sprintRows ?? []) as Sprint[]
  const { data: sprintAreas } = areaId ? await c.db.from('sprint_areas').select('sprint_id, area_id').eq('area_id', areaId) : { data: [] }
  // The page's sprint when there is a page; otherwise none until someone plans it.
  const sprintId = chosen ? chosen.id : areaId ? fixSprintForArea(areaId, sprints, sprintAreas ?? [])?.id ?? null : null
  const prefix = p.kind === 'task' ? 'TASK' : p.kind === 'test_mismatch' ? 'MM' : 'DEV'
  const { data: key, error: keyError } = await c.db.rpc('next_ticket_key', { prefix })
  if (keyError) return fail(500, keyError.message)
  const { data: made, error } = await c.db.from('tickets').insert({
    key, kind: p.kind, title: p.title ?? `Failing ${tcIds[0]}`, description: failureText(p) || null,
    severity: p.severity ?? p.priority ?? 'Medium', priority: p.priority ?? null,
    owner_id: owner?.id ?? null, accountable_id: accountable?.id ?? null, created_by: c.actorId, created_via: c.tokenId,
    case_id: cases[0]?.id ?? null, area_id: page?.id ?? null, current_sprint_id: sprintId,
    found_in_sprint_id: p.kind === 'task' ? null : currentSprint(sprints)?.id ?? null,
    requirement_ids: p.requirement_ids ?? null, defect_id: p.defect_id ?? null, external_ref: p.external_ref ?? null,
    blocked_reason: p.blocked ?? null, blocked_at: p.blocked ? new Date().toISOString() : null,
  }).select('id, key').single()
  if (error) return fail(400, error.message)
  if (cases.length > 1) await c.db.from('ticket_cases').insert(cases.slice(1).map((x) => ({ ticket_id: made.id, case_id: x.id })))
  const linkError = await setLinks(c.db, made.id, p)
  if (linkError) return linkError
  return { key: made.key, created: true, ticket: (await ticketsJson(c.db, [made.id]))[0] }
}

/** Withdraws a ticket this token's person raised by mistake: it is deferred as cancelled. */
export async function cancelTicket(c: Caller, keyAsked: string, reason: string) {
  const key = await currentTicketKey(c.db, keyAsked)
  const { data: t } = key ? await c.db.from('tickets').select('id, key, state, created_by, created_via').eq('key', key).maybeSingle() : { data: null }
  if (!t) return fail(404, `No ticket ${keyAsked}`)
  if (t.created_via !== c.tokenId && (!c.actorId || t.created_by !== c.actorId)) return fail(403, `Only whoever raised ${t.key} can cancel it through the API`)
  if (['closed', 'deferred', 'duplicate'].includes(t.state)) return fail(409, `${t.key} is already ${t.state}`)
  const { error } = await c.db.from('tickets').update({ state: 'deferred', defer_reason: `Cancelled: ${reason}`.slice(0, 2000) }).eq('id', t.id)
  if (error) return fail(400, error.message)
  await addComment(c, t.id, `Cancelled through the API: ${reason}`)
  return { key: t.key, state: 'deferred', cancelled: true }
}

export { isFailure }
