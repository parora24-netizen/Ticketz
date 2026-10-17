import { describe, expect, it } from 'vitest'
import { boardMove, droppableStages } from './board-moves'

describe('sprint board drops', () => {
  it('turns drops into the right step for QA', () => {
    expect(boardMove('test', 'done', 'qa', null)).toMatchObject({ kind: 'result', result: 'passed', ask: false })
    expect(boardMove('test', 'fix', 'qa', null)).toMatchObject({ kind: 'result', result: 'failed', ask: true })
    expect(boardMove('retest', 'done', 'qa', 'ready_for_retest')).toMatchObject({ kind: 'ticket', to: 'closed' })
    expect(boardMove('retest', 'fix', 'qa', 'ready_for_retest')).toMatchObject({ kind: 'ticket', to: 'reopened', ask: 'note' })
  })

  it('lets a dev hand a fix over, and nothing a tester owns', () => {
    expect(boardMove('fix', 'retest', 'dev', 'in_fix')).toMatchObject({ kind: 'ticket', to: 'ready_for_retest', ask: 'build' })
    expect(boardMove('test', 'done', 'dev', null)).toHaveProperty('error')
    expect(boardMove('retest', 'done', 'dev', 'ready_for_retest')).toHaveProperty('error')
  })

  it('explains why a fix cannot move yet', () => {
    expect(boardMove('fix', 'retest', 'dev', 'triaged')).toEqual({ error: 'Start the fix first (the ticket is not in fix yet)' })
    expect(boardMove('fix', 'retest', 'dev', null)).toEqual({ error: 'Raise a ticket for this failure first' })
    expect(boardMove('done', 'test', 'lead', null)).toHaveProperty('error')
  })

  it('lists the columns a card may land on', () => {
    expect(droppableStages('test', 'qa', null)).toEqual(['fix', 'done'])
    expect(droppableStages('fix', 'dev', 'in_fix')).toEqual(['retest'])
    expect(droppableStages('test', 'dev', null)).toEqual([])
  })
})
