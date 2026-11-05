import { describe, expect, it } from 'vitest'
import { AutomationPatch, automationFromDb, automationToDb, CasesQuery, ListQuery, RaisePayload, ResultsQuery, RunsQuery, failureKind, failureText, readQuery, retestMove } from './tickets-api'

describe('tickets API', () => {
  it('raises without a test case when there is a title', () => {
    expect(RaisePayload.safeParse({ title: 'Save does nothing', zone: 'Engine', page: 'Admin' }).success).toBe(true)
    expect(RaisePayload.safeParse({ description: 'no title or case' }).success).toBe(false)
    expect(RaisePayload.safeParse({ title: 'Mismatch', kind: 'test_mismatch' }).success).toBe(false)
    expect(RaisePayload.safeParse({ tc_id: 'tc_fn_070' }).data?.tc_id).toBe('TC_FN_070')
  })

  it('takes automation fields only, and maps not automatable to what Launchpad stores', () => {
    expect(AutomationPatch.safeParse({ automation_status: 'blocked', automation_note: 'needs an engine', automation_owner: 'e2e tests runner', automation_ref: 'specs/a.ts' }).success).toBe(true)
    expect(AutomationPatch.safeParse({ automation_note: null }).success).toBe(true)
    expect(AutomationPatch.safeParse({}).success).toBe(false)
    expect(AutomationPatch.safeParse({ automation_status: 'done' }).success).toBe(false)
    expect(AutomationPatch.safeParse({ automation_status: 'automated', title: 'reworded' }).success).toBe(false)
    expect(automationToDb('not_automatable')).toBe('manual_only')
    expect(automationFromDb('manual_only')).toBe('not_automatable')
    expect(automationFromDb(automationToDb('in_progress'))).toBe('in_progress')
  })

  it('filters cases by automation, priority and type, refusing unknown values', () => {
    const read = (q: string) => readQuery(CasesQuery, new URLSearchParams(q))
    expect(read('automation=blocked,in_progress&priority=High&type=Functional').data).toMatchObject({ automation: ['blocked', 'in_progress'], priority: ['High'], type: ['Functional'] })
    expect(read('automation=done').success).toBe(false)
    expect(read('priority=urgent').success).toBe(false)
    expect(read('text_updated_since=2026-11-01T00:00:00Z').data?.text_updated_since).toBe('2026-11-01T00:00:00Z')
  })

  it('calls an automated failure a mismatch when the latest manual test passed', () => {
    expect(failureKind('passed')).toBe('test_mismatch')
    for (const manual of ['failed', 'blocked', null, undefined]) expect(failureKind(manual)).toBe('defect')
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

  it('keeps a defect id as sent and filters the list by several', () => {
    expect(RaisePayload.parse({ tc_id: 'TC_FN_070', defect_id: ' DEF-12 ' }).defect_id).toBe('DEF-12')
    expect(ListQuery.parse({ defect_id: 'DEF-12, DEF-13' }).defect_id).toEqual(['DEF-12', 'DEF-13'])
  })

  it('pages cases and results, and reads latest=true', () => {
    expect(CasesQuery.parse({ tc_id: 'tc_fn_1', offset: '1000' })).toMatchObject({ tc_id: ['TC_FN_1'], offset: 1000, limit: 200 })
    expect(CasesQuery.safeParse({ updated_since: 'yesterday' }).success).toBe(false)
    expect(ResultsQuery.parse({ latest: 'true', result: 'failed,known_defect' })).toMatchObject({ latest: true, result: ['failed', 'known_defect'], offset: 0 })
    expect(ResultsQuery.parse({}).latest).toBe(false)
    expect(ResultsQuery.safeParse({ kind: 'nightly' }).success).toBe(false)
  })

  it('reads since and updated_after as updated_since, and refuses filters it does not know', () => {
    const at = '2026-10-30T00:00:00Z'
    for (const k of ['since', 'updated_after', 'updated_since']) {
      const q = readQuery(ResultsQuery, new URLSearchParams({ [k]: at }))
      expect(q.success && q.data.updated_since).toBe(at)
    }
    const both = readQuery(ResultsQuery, new URLSearchParams([['since', '2026-01-01T00:00:00Z'], ['updated_since', at]]))
    expect(both.success && both.data.updated_since).toBe(at)
    expect(readQuery(ResultsQuery, new URLSearchParams({ updatedAfter: at })).success).toBe(false)
    expect(readQuery(RunsQuery, new URLSearchParams({ build: 'index-1,index-2' })).data?.build).toEqual(['index-1', 'index-2'])
  })
})
