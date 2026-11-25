import { describe, expect, it } from 'vitest'
import { planCleanup, planSize, type CleanCase, type CleanTicket } from './cleanup'

const kase = (id: string, manual: string | null, auto: string | null, tester: string | null = 'uday'): CleanCase =>
  ({ id, tc_id: `TC_${id}`, tester_id: tester, manual_result: manual, manual_at: '2026-11-12T00:00:00Z', auto_result: auto, auto_at: '2026-11-18T00:00:00Z' })
const ticket = (key: string, case_id: string | null, kind = 'test_mismatch', owner: string | null = null): CleanTicket => ({ id: key, key, kind, owner_id: owner, case_id })

describe('sprint clean-up', () => {
  const cases = new Map([
    ['1', kase('1', 'passed', 'passed')],
    ['2', kase('2', 'passed', 'failed')],
    ['3', kase('3', 'passed', 'known_defect')],
    ['4', kase('4', 'failed', 'passed')],
    ['5', kase('5', null, 'failed', null)],
    ['6', kase('6', 'failed', 'failed')],
    ['7', kase('7', null, 'passed')],
  ])
  const plan = planCleanup({
    tickets: [
      ticket('MM-1', '1'), ticket('MM-2', '2', 'test_mismatch', 'uday'), ticket('DEV-2', '2', 'defect', 'himanshu'),
      ticket('DEV-3', '3', 'defect', 'amit'), ticket('MM-9', '3', 'test_mismatch', 'juan'), ticket('DEV-4', '4', 'defect', 'amit'),
      ticket('DEV-5', '5', 'defect'), ticket('DEV-6', '6', 'defect', 'amit'), ticket('TASK-1', null, 'task'), ticket('DEV-7', '7', 'defect', 'amit'),
    ],
    cases,
    openMismatch: new Map([['2', { id: 'MM-2', key: 'MM-2' }], ['3', { id: 'MM-9', key: 'MM-9' }]]),
    automationOwner: 'juan',
    tester: 'uday',
  })

  it('closes what passes both ways', () => expect(plan.close.map((s) => s.key)).toEqual(['MM-1']))
  it('closes what passes in automation and was never tested by hand', () => expect(plan.closeAuto.map((s) => s.key)).toEqual(['DEV-7']))
  it('counts only the clean-ups chosen', () => expect(planSize(plan, ['close', 'closeAuto'])).toBe(2))
  it('marks a bug a duplicate of the open test issue on its case', () => {
    expect(plan.duplicate.map((s) => [s.key, s.of_key])).toEqual([['DEV-2', 'MM-2'], ['DEV-3', 'MM-9']])
  })
  it('hands manual pass, automation fail to the automation owner, once', () => {
    expect(plan.toAutomation.map((s) => s.key)).toEqual(['MM-2'])
  })
  it('sends manual fail, automation pass to the tester', () => {
    expect(plan.toTester.map((s) => [s.key, s.tester_id])).toEqual([['DEV-4', 'uday']])
  })
  it('gives a tester to cases with none, and leaves real bugs and tasks alone', () => {
    expect(plan.tester.map((t) => t.tc_id)).toEqual(['TC_5'])
    expect(planSize(plan)).toBe(7)
  })
  it('does nothing for the automation owner when none is chosen', () => {
    const p = planCleanup({ tickets: [ticket('MM-2', '2')], cases, openMismatch: new Map(), automationOwner: null, tester: null })
    expect(planSize(p)).toBe(0)
  })
})
