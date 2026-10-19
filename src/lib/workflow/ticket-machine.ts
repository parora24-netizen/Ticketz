export type Role = 'lead' | 'dev' | 'qa'

export const TICKET_STATES = [
  'new',
  'triaged',
  'in_fix',
  'ready_for_retest',
  'reopened',
  'closed',
  'deferred',
  'duplicate',
] as const
export type TicketState = (typeof TICKET_STATES)[number]

export const STATE_LABEL: Record<TicketState, string> = {
  new: 'New',
  triaged: 'Triaged',
  in_fix: 'In fix',
  ready_for_retest: 'Ready for retest',
  reopened: 'Reopened',
  closed: 'Closed',
  deferred: 'Deferred',
  duplicate: 'Duplicate',
}

export const OPEN_STATES: TicketState[] = ['new', 'triaged', 'in_fix', 'reopened', 'ready_for_retest']
export const RESOLVED_STATES: TicketState[] = ['closed', 'deferred', 'duplicate']

/**
 * Who may move a ticket from one state to another.
 * Must match the ticket_transitions rows in supabase/migrations/20261017000100_schema.sql;
 * ticket-machine.test.ts fails if they drift apart.
 */
export const TRANSITIONS: Partial<Record<TicketState, Partial<Record<TicketState, Role[]>>>> = {
  new: { triaged: ['lead', 'qa'], in_fix: ['lead', 'dev'], closed: ['lead', 'qa'], deferred: ['lead'], duplicate: ['lead', 'qa'] },
  triaged: { in_fix: ['lead', 'dev'], closed: ['lead', 'qa'], deferred: ['lead'], duplicate: ['lead', 'qa'] },
  in_fix: { ready_for_retest: ['lead', 'dev'], deferred: ['lead'] },
  reopened: { in_fix: ['lead', 'dev'], deferred: ['lead'] },
  ready_for_retest: { closed: ['lead', 'qa'], reopened: ['lead', 'qa'], deferred: ['lead'] },
  closed: { reopened: ['lead', 'qa'] },
  deferred: { triaged: ['lead'] },
}

/** The button wording for a move, from the actor's point of view. */
export const ACTION_LABEL: Partial<Record<TicketState, string>> = {
  triaged: 'Triage',
  in_fix: 'Start fix',
  ready_for_retest: 'Fixed, ready for retest',
  closed: 'Retest passed, close',
  reopened: 'Retest failed, reopen',
  deferred: 'Defer',
  duplicate: 'Mark duplicate',
}

export function allowedMoves(from: TicketState, role: Role): TicketState[] {
  const next = TRANSITIONS[from] ?? {}
  return (Object.keys(next) as TicketState[]).filter((to) => next[to]?.includes(role))
}

export function canMove(from: TicketState, to: TicketState, role: Role): boolean {
  return TRANSITIONS[from]?.[to]?.includes(role) ?? false
}

/** Fields a move needs before the database will accept it. */
export function requiredFor(to: TicketState): 'fixed_in_build' | 'defer_reason' | 'duplicate_of' | null {
  if (to === 'ready_for_retest') return 'fixed_in_build'
  if (to === 'deferred') return 'defer_reason'
  if (to === 'duplicate') return 'duplicate_of'
  return null
}

/** Moves that are a retest: they also record a manual result on the ticket's test case. */
export function retestResult(from: TicketState, to: TicketState): 'passed' | 'failed' | null {
  if (from !== 'ready_for_retest') return null
  if (to === 'closed') return 'passed'
  if (to === 'reopened') return 'failed'
  return null
}
