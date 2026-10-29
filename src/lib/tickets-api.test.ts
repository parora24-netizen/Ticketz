import { describe, expect, it } from 'vitest'
import { ListQuery, RaisePayload, failureText, nextKey, retestMove } from './tickets-api'

describe('tickets API', () => {
  it('names tickets like the workbook and steps past taken keys', () => {
    expect(nextKey('defect', 'TC_FN_070', new Set())).toBe('DEV-TC_FN_070')
    expect(nextKey('test_mismatch', 'TC_FN_070', new Set())).toBe('MM-TC_FN_070')
    expect(nextKey('defect', 'TC_FN_070', new Set(['DEV-TC_FN_070', 'DEV-TC_FN_070-2']))).toBe('DEV-TC_FN_070-3')
  })

  it('reads a raise request, defaulting to a defect', () => {
    const p = RaisePayload.parse({ tc_id: 'tc_fn_070', error: 'boom' })
    expect(p).toMatchObject({ tc_id: 'TC_FN_070', kind: 'defect' })
    expect(RaisePayload.safeParse({ tc_id: 'FN_070' }).success).toBe(false)
  })

  it('writes the failure into the description', () => {
    expect(failureText({ error: 'Expected 3', build: 'b1', run_id: 'r9', url: 'https://ci/x' }))
      .toBe('Error: Expected 3\nBuild b1, run r9\nReport: https://ci/x')
  })

  it('filters the list by open states and several test cases', () => {
    const q = ListQuery.parse({ state: 'open', tc_id: 'tc_fn_1,TC_FN_2' })
    expect(q.state).toEqual(['new', 'triaged', 'in_fix', 'reopened', 'ready_for_retest'])
    expect(q.tc_id).toEqual(['TC_FN_1', 'TC_FN_2'])
    expect(q.limit).toBe(200)
    expect(ListQuery.safeParse({ state: 'nonsense' }).success).toBe(false)
  })

  it('retests only tickets ready for retest: a pass closes, a fail reopens', () => {
    expect(retestMove('ready_for_retest', 'passed')).toEqual({ to: 'closed' })
    expect(retestMove('ready_for_retest', 'failed')).toEqual({ to: 'reopened' })
    expect(retestMove('in_fix', 'passed')).toEqual({ error: 'The ticket is in fix, not ready for retest' })
  })
})
