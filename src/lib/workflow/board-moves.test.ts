import { describe, expect, it } from 'vitest'
import { boardMove, droppableFixStages, droppableStages, droppableTestStages, fixBoardMove, fixStage, testBoardMove } from './board-moves'

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

  it('test sprints: automate, then pass or fail; a result can be corrected; devs stay put', () => {
    expect(testBoardMove('automate', 'auto', 'qa')).toMatchObject({ kind: 'automation', value: 'automated' })
    expect(testBoardMove('automate', 'manual', 'qa')).toMatchObject({ kind: 'automation', value: 'manual_only' })
    expect(testBoardMove('manual', 'failed', 'qa')).toMatchObject({ kind: 'result', result: 'failed', ask: true })
    expect(droppableTestStages('auto', 'qa')).toEqual(['passed', 'failed'])
    expect(testBoardMove('manual', 'passed', 'dev')).toHaveProperty('error')
    expect(testBoardMove('failed', 'passed', 'qa')).toMatchObject({ kind: 'result', result: 'passed', ask: false })
    expect(testBoardMove('passed', 'failed', 'lead')).toMatchObject({ kind: 'result', result: 'failed', ask: true })
    expect(droppableTestStages('failed', 'qa')).toEqual(['passed'])
    expect(testBoardMove('failed', 'passed', 'dev')).toHaveProperty('error')
  })

  it('fix sprints: triage, fix, retest, close; passing cases close from triage', () => {
    expect(fixStage('new')).toBe('triage')
    expect(fixStage('reopened')).toBe('fix')
    expect(fixBoardMove('triage', 'fix', 'qa', 'new')).toMatchObject({ kind: 'ticket', to: 'triaged' })
    expect(fixBoardMove('triage', 'fix', 'dev', 'new')).toMatchObject({ kind: 'ticket', to: 'in_fix' })
    expect(fixBoardMove('triage', 'done', 'qa', 'new')).toMatchObject({ kind: 'ticket', to: 'closed' })
    expect(fixBoardMove('triage', 'done', 'dev', 'new')).toHaveProperty('error')
    expect(fixBoardMove('fix', 'retest', 'dev', 'triaged')).toEqual({ error: 'Start the fix first (open the card)' })
    expect(droppableFixStages('retest', 'qa', 'ready_for_retest')).toEqual(['fix', 'done'])
  })

  it('fix sprints: a not-yet-fixed ticket can be flagged blocked and back', () => {
    expect(fixStage('in_fix', true)).toBe('blocked')
    expect(fixStage('ready_for_retest', true)).toBe('retest')
    expect(fixBoardMove('fix', 'blocked', 'dev', 'in_fix')).toMatchObject({ kind: 'block', on: true, ask: 'block' })
    expect(fixBoardMove('blocked', 'fix', 'qa', 'in_fix')).toMatchObject({ kind: 'block', on: false })
    expect(fixBoardMove('blocked', 'retest', 'dev', 'in_fix')).toHaveProperty('error')
    expect(fixBoardMove('retest', 'blocked', 'qa', 'ready_for_retest')).toHaveProperty('error')
  })
})
