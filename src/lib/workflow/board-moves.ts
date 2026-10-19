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
