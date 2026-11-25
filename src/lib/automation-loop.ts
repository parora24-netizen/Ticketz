import { z } from 'zod'

/**
 * The automation loop's rules, kept pure: asks (needs, questions, decisions), why a case is blocked,
 * the change feed the runner polls, and when a passing run closes a retest. The API routes and the
 * app's pages do the database work.
 */

export const ASK_KINDS = ['need', 'question', 'decision'] as const
export type AskKind = (typeof ASK_KINDS)[number]
export const ASK_STATES = ['open', 'done', 'declined'] as const
export type AskState = (typeof ASK_STATES)[number]
/** How a closed ask was settled, whatever its kind. */
export const OUTCOMES = ['edited', 'deferred', 'retired', 'manual', 'access', 'answered', 'duplicate'] as const
export type Outcome = (typeof OUTCOMES)[number]
export const OUTCOME_LABEL: Record<Outcome, string> = {
  edited: 'Cases edited', deferred: 'Cases deferred', retired: 'Cases retired', manual: 'Manual only',
  access: 'Access given', answered: 'Answered', duplicate: 'Duplicate',
}
/** The words the API took before outcomes covered every kind, and what each became. */
const LEGACY_OUTCOME: Record<string, Outcome> = { retire: 'manual', rewrite: 'edited', restore: 'answered', other: 'answered' }
export const BLOCK_CODES = ['needs_write', 'needs_server', 'needs_account', 'needs_mailbox', 'needs_text', 'control_gone', 'screen_hold', 'other'] as const

export const KIND_LABEL: Record<AskKind, string> = { need: 'Need', question: 'Question', decision: 'Decision' }
export const BLOCK_LABEL: Record<(typeof BLOCK_CODES)[number], string> = {
  needs_write: 'Needs write access', needs_server: 'Needs a server', needs_account: 'Needs an account', needs_mailbox: 'Needs a mailbox',
  needs_text: 'Needs case text', control_gone: 'Control no longer exists', screen_hold: 'Screen on hold', other: 'Other',
}

/**
 * How people see an ask: Open or Closed, and how it was settled. An open ask waiting on the test
 * suite reads Suite change. The API keeps its own words (askStatus) for the runner.
 */
export function askDisplay(_kind: AskKind, state: AskState, outcome?: string | null, suiteNeed?: string | null): { state: 'Open' | 'Closed'; outcome: string } {
  if (state === 'open') return { state: 'Open', outcome: suiteNeed ? 'Suite change' : '' }
  return { state: 'Closed', outcome: OUTCOME_LABEL[(outcome ?? 'answered') as Outcome] ?? 'Answered' }
}

/** The status as the API shows it: requested (a need) or open, suite (waiting on a suite change), or the outcome. */
export const askStatus = (kind: AskKind, state: AskState, outcome?: string | null, suiteNeed?: string | null) =>
  state === 'open' ? (suiteNeed ? 'suite' : kind === 'need' ? 'requested' : 'open') : (outcome ?? 'answered')

/** Any of the API's words for a state: open, requested, done, an outcome, or the older provided, answered, decided and declined. */
const STATE_WORDS = ['open', 'requested', 'done', 'provided', 'decided', 'declined', ...OUTCOMES] as const
const StateWord = z.enum(STATE_WORDS)
const OutcomeWord = z.enum([...OUTCOMES, 'retire', 'rewrite', 'restore', 'other'])

/**
 * What a state word and an outcome come to: open, or closed with one outcome. A closed ask needs
 * its outcome, given as the state (state: "edited") or alongside it (state: "done", outcome: "edited").
 */
export function closeWith(state?: string | null, outcome?: string | null): { state?: AskState; outcome?: Outcome | null; error?: string } {
  if (!state && !outcome) return {}
  if (state === 'open' || state === 'requested') return { state: 'open', outcome: null }
  let o = outcome ? (LEGACY_OUTCOME[outcome] ?? outcome) as Outcome : undefined
  if (state && (OUTCOMES as readonly string[]).includes(state)) o = state as Outcome
  if (state === 'provided') o ??= 'access'
  if (state === 'declined') o ??= 'answered'
  if (!o) return { error: `Say how it was settled: ${OUTCOMES.join(', ')}` }
  return { state: 'done', outcome: o }
}

const TcId = z.string().trim().min(1).max(40).transform((s) => s.toUpperCase())
const day = z.iso.date()

/** POST /api/asks. A need with a need_key that is already open adds its cases to that one. */
export const AskCreate = z.strictObject({
  kind: z.enum(ASK_KINDS),
  title: z.string().trim().min(3).max(300),
  detail: z.string().trim().max(5000).optional(),
  need_key: z.string().trim().min(1).max(200).optional(),
  store: z.string().trim().max(200).optional(),
  options: z.array(z.string().trim().min(1).max(200)).max(10).optional(),
  owner: z.string().trim().min(1).max(100).optional(),
  due_on: day.optional(),
  cases: z.array(TcId).max(1000).optional(),
  ticket: z.string().trim().max(60).optional(),
})

/** PATCH /api/asks/{key}. */
export const AskPatch = z.strictObject({
  title: z.string().trim().min(3).max(300).optional(),
  detail: z.string().trim().max(5000).nullable().optional(),
  state: StateWord.optional(),
  answer: z.string().trim().max(5000).nullable().optional(),
  outcome: OutcomeWord.nullable().optional(),
  /** What the test suite cannot do yet; the ask then waits on a suite change, with the suite's owner. null clears it. */
  suite: z.string().trim().min(3).max(2000).nullable().optional(),
  /** Closing as a duplicate: the ask that covers it (its cases move there). */
  duplicate_of: z.string().trim().regex(/^ASK-\d+$/i, 'An ask key, e.g. ASK-6').transform((s) => s.toUpperCase()).optional(),
  store: z.string().trim().max(200).nullable().optional(),
  owner: z.string().trim().min(1).max(100).nullable().optional(),
  due_on: day.nullable().optional(),
  add_cases: z.array(TcId).max(1000).optional(),
  remove_cases: z.array(TcId).max(1000).optional(),
}).refine((p) => Object.keys(p).length > 0, { message: 'Send at least one field' })

/** A case's automation fields, set by a runner token: one case, or many in one call. */
export const CaseAutomation = z.strictObject({
  automation_status: z.enum(['not_automated', 'in_progress', 'automated', 'blocked']).optional(),
  automation_note: z.string().trim().max(2000).nullable().optional(),
  automation_owner: z.string().trim().max(200).nullable().optional(),
  automation_ref: z.string().trim().max(500).nullable().optional(),
  automation_block: z.enum(BLOCK_CODES).nullable().optional(),
  automation_block_ticket: z.string().trim().max(60).nullable().optional(),
  /** The ask this case waits on (e.g. ASK-6); the case is added to that ask's cases. */
  automation_ask: z.string().trim().regex(/^ASK-\d+$/i, 'An ask key, e.g. ASK-6').optional(),
  automation_proposed: z.literal('not_automatable').nullable().optional(),
  automation_proposed_reason: z.string().trim().max(2000).nullable().optional(),
  /** The case's revision the change was made against; a newer one means a person edited it since. */
  revision: z.number().int().min(1).optional(),
})
export const BulkCaseAutomation = z.strictObject({ cases: z.array(CaseAutomation.extend({ tc_id: TcId })).min(1).max(500) })

export const PrUpsert = z.strictObject({
  key: z.string().trim().min(1).max(200).optional(),
  url: z.url({ protocol: /^https?$/ }).max(500).optional(),
  title: z.string().trim().max(300).optional(),
  author: z.string().trim().max(200).optional(),
  reviewer: z.string().trim().max(100).nullable().optional(),
  state: z.enum(['open', 'merged', 'closed']).optional(),
  cases: z.array(TcId).max(1000).optional(),
  opened_at: z.iso.datetime({ offset: true }).optional(),
  merged_at: z.iso.datetime({ offset: true }).optional(),
})

export const ScreenHold = z.strictObject({
  defect: z.string().trim().max(60).nullable().optional(),
  reason: z.string().trim().max(500).nullable().optional(),
  until: day.nullable().optional(),
})

export const Heartbeat = z.strictObject({
  state: z.enum(['idle', 'batching', 'paused_limit', 'cluster_down']),
  batch: z.string().trim().max(200).nullable().optional(),
  backlog: z.number().int().min(0).optional(),
  since: z.iso.datetime({ offset: true }).optional(),
})
export const RunnerEvent = z.strictObject({
  kind: z.enum(['batch_started', 'batch_finished', 'batch_failed']),
  batch: z.string().trim().max(200).optional(),
  detail: z.string().trim().max(2000).optional(),
})

/** A screen hold is on while its defect is open and its date (if any) has not passed. */
export function holdActive(h: { ticketState?: string | null; hasTicket: boolean; until?: string | null }, today: string): boolean {
  const ticketOpen = h.hasTicket && !['closed', 'deferred', 'duplicate'].includes(h.ticketState ?? 'closed')
  const dated = !!h.until && h.until >= today
  return h.hasTicket ? ticketOpen && (!h.until || dated) : dated
}

/**
 * A passing automated run closes a ticket that is ready for retest when it ran on the fixed build or
 * a later one. Builds are commit hashes, so "later" means first seen later; a fixed build the runs
 * have never carried (a product version, say) cannot be ordered, and then a pass after the fix was
 * handed over will do.
 */
export function retestPasses(t: { fixedBuild: string | null; readyAt: string | null }, run: { build: string | null; at: string }, firstSeen: Map<string, string>): boolean {
  if (t.readyAt && run.at < t.readyAt) return false
  if (!t.fixedBuild || !run.build) return true
  if (run.build === t.fixedBuild) return true
  const fixed = firstSeen.get(t.fixedBuild), mine = firstSeen.get(run.build)
  return !fixed || (!!mine && mine >= fixed)
}

// The change feed ----------------------------------------------------------------------------------

const TEXT_FIELDS = ['title', 'preconditions', 'steps', 'test_data', 'expected']
export type ChangeRow = { id: number; table_name: string; row_id: string; label: string | null; action: string; changes: Record<string, unknown>; at: string }
export type FeedEvent = { cursor: number; type: string; at: string; [k: string]: unknown }

/** Change log rows as the events a runner acts on; rows that matter to no one give none. */
export function feedEvents(rows: ChangeRow[], asks: Map<string, { key: string; kind: AskKind }>, areas: Map<string, { zone: string; page: string }>): FeedEvent[] {
  const out: FeedEvent[] = []
  for (const r of rows) {
    const e = (type: string, extra: Record<string, unknown> = {}) => out.push({ cursor: r.id, type, at: r.at, ...extra })
    const pair = (k: string) => (Array.isArray(r.changes[k]) ? r.changes[k] as [unknown, unknown] : null)
    const after = (k: string) => (r.action === 'insert' ? r.changes[k] : pair(k)?.[1])
    if (r.action === 'delete') continue
    if (r.table_name === 'test_cases') {
      const tc_id = r.label
      if (r.action === 'insert') { e('case.created', { tc_id }); continue }
      if (TEXT_FIELDS.some((k) => pair(k))) e('case.text_changed', { tc_id, revision: pair('revision')?.[1] ?? null })
      if (pair('automation')) e('case.automation_changed', { tc_id, from: pair('automation')![0], to: pair('automation')![1] })
      if (pair('automation_block')) e('case.block_changed', { tc_id, block: pair('automation_block')![1] })
    } else if (r.table_name === 'tickets') {
      if (r.action === 'insert') e('ticket.created', { key: r.label, state: after('state') })
      else if (pair('state')) e('ticket.state_changed', { key: r.label, from: pair('state')![0], to: pair('state')![1] })
    } else if (r.table_name === 'asks') {
      const ask = asks.get(r.row_id)
      const kind = (after('kind') as AskKind | undefined) ?? ask?.kind
      if (!kind) continue
      const key = ask?.key ?? r.label
      if (r.action === 'insert') e(`${kind}.created`, { key })
      else if (pair('state')) {
        const to = pair('state')![1] as AskState
        e(to === 'open' ? `${kind}.reopened` : `${kind}.closed`, to === 'open' ? { key } : { key, outcome: after('outcome') ?? 'answered' })
      }
      if (pair('suite_need')?.[1]) e(`${kind}.suite_change`, { key, need: pair('suite_need')![1] })
    } else if (r.table_name === 'automation_prs') {
      if (r.action === 'insert') e('pr.opened', { key: r.label })
      else if (pair('state')) e(`pr.${pair('state')![1]}`, { key: r.label })
    } else if (r.table_name === 'areas') {
      if (['automation_hold_ticket_id', 'automation_hold_reason', 'automation_hold_until'].some((k) => pair(k))) {
        const a = areas.get(r.row_id)
        e('screen.hold_changed', { zone: a?.zone ?? null, page: a?.page ?? null })
      }
    }
  }
  return out
}
