import type { Stage, TestStage } from './case-stage'
import { STAGES, TEST_STAGES } from './case-stage'
import { canMove, type Role, type TicketState } from './ticket-machine'

/** What dropping a case on another sprint-board column does. */
export type BoardMove =
  | { kind: 'result'; result: 'passed' | 'failed'; ask: boolean; label: string }
  | { kind: 'ticket'; to: TicketState; ask: 'build' | 'note' | null; label: string }

/**
 * The step a drop stands for, or why it can't happen. `ticketState` is the case's open ticket,
 * if it has one. QA and the lead record results; devs move their fixes along.
 */
export function boardMove(from: Stage, to: Stage, role: Role, ticketState: TicketState | null): BoardMove | { error: string } {
  const tester = role !== 'dev'
  switch (`${from}>${to}`) {
    case 'test>done':
      return tester ? { kind: 'result', result: 'passed', ask: false, label: 'Pass recorded' } : { error: 'QA or the lead records results' }
    case 'test>fix':
      return tester ? { kind: 'result', result: 'failed', ask: true, label: 'Fail recorded' } : { error: 'QA or the lead records results' }
    case 'fix>retest': {
      if (!ticketState) return { error: 'Raise a ticket for this failure first' }
      if (ticketState !== 'in_fix') return { error: 'Start the fix first (the ticket is not in fix yet)' }
      return canMove('in_fix', 'ready_for_retest', role)
        ? { kind: 'ticket', to: 'ready_for_retest', ask: 'build', label: 'Ready for retest' }
        : { error: 'A developer or the lead marks a fix ready' }
    }
    case 'retest>done':
      return canMove('ready_for_retest', 'closed', role)
        ? { kind: 'ticket', to: 'closed', ask: null, label: 'Retest passed, ticket closed' }
        : { error: 'QA or the lead retests' }
    case 'retest>fix':
      return canMove('ready_for_retest', 'reopened', role)
        ? { kind: 'ticket', to: 'reopened', ask: 'note', label: 'Retest failed, ticket reopened' }
        : { error: 'QA or the lead retests' }
    default:
      return { error: 'That step does not follow from here' }
  }
}

/** A drop on a test sprint's board: mark it automated, or record a pass or a fail. */
export type TestBoardMove =
  | { kind: 'automation'; value: 'automated' | 'manual_only'; label: string }
  | { kind: 'result'; result: 'passed' | 'failed'; ask: boolean; label: string }

export function testBoardMove(from: TestStage, to: TestStage, role: Role): TestBoardMove | { error: string } {
  if (role === 'dev') return { error: 'QA or the lead runs test sprints' }
  switch (`${from}>${to}`) {
    case 'automate>auto': return { kind: 'automation', value: 'automated', label: 'Marked automated' }
    case 'automate>manual': return { kind: 'automation', value: 'manual_only', label: 'Marked manual only' }
    case 'auto>passed':
    case 'manual>passed': return { kind: 'result', result: 'passed', ask: false, label: 'Pass recorded' }
    case 'auto>failed':
    case 'manual>failed': return { kind: 'result', result: 'failed', ask: true, label: 'Fail recorded' }
    default: return { error: from === 'failed' ? 'Failures are fixed in a fix sprint' : 'That step does not follow from here' }
  }
}

export function droppableTestStages(from: TestStage, role: Role): TestStage[] {
  return TEST_STAGES.filter((to) => to !== from && !('error' in testBoardMove(from, to, role)))
}

/** Columns a dragged case can be dropped on, for highlighting. */
export function droppableStages(from: Stage, role: Role, ticketState: TicketState | null): Stage[] {
  return STAGES.filter((to) => to !== from && !('error' in boardMove(from, to, role, ticketState)))
}

/**
 * Fix sprints: the board follows each ticket. New tickets wait in To triage, where they are
 * given to a developer, or closed straight away when the case already passes.
 */
export const FIX_STAGES = ['triage', 'fix', 'retest', 'done'] as const
export type FixStage = (typeof FIX_STAGES)[number]
export const FIX_STAGE_LABEL: Record<FixStage, string> = { triage: 'To triage', fix: 'Fix', retest: 'Retest', done: 'Done' }

export function fixStage(state: TicketState): FixStage {
  if (state === 'new') return 'triage'
  if (state === 'ready_for_retest') return 'retest'
  if (state === 'closed' || state === 'deferred' || state === 'duplicate') return 'done'
  return 'fix'
}

export function fixBoardMove(from: FixStage, to: FixStage, role: Role, state: TicketState): BoardMove | { error: string } {
  const go = (next: TicketState, label: string, ask: 'build' | 'note' | null = null): BoardMove | { error: string } =>
    canMove(state, next, role) ? { kind: 'ticket', to: next, ask, label } : { error: `A ${role === 'qa' ? 'QA' : role} cannot do that step` }
  switch (`${from}>${to}`) {
    // QA and the lead triage; a developer picking a ticket up starts the fix.
    case 'triage>fix': return role === 'dev' ? go('in_fix', 'Fix started') : go('triaged', 'Triaged')
    case 'triage>done':
    case 'fix>done': return state === 'in_fix' || state === 'reopened'
      ? { error: 'Mark the fix ready for retest first' }
      : go('closed', 'Closed: the case already passes')
    case 'fix>retest': return state === 'in_fix' ? go('ready_for_retest', 'Ready for retest', 'build') : { error: 'Start the fix first (open the card)' }
    case 'retest>done': return go('closed', 'Retest passed, ticket closed')
    case 'retest>fix': return go('reopened', 'Retest failed, ticket reopened', 'note')
    default: return { error: 'That step does not follow from here' }
  }
}

export function droppableFixStages(from: FixStage, role: Role, state: TicketState): FixStage[] {
  return FIX_STAGES.filter((to) => to !== from && !('error' in fixBoardMove(from, to, role, state)))
}
