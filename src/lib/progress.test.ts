import { describe, expect, it } from 'vitest'
import { count, pageProgress, pageStatus, pct, type ProgressCase } from './progress'

const c = (x: Partial<ProgressCase>): ProgressCase => ({ area_id: 'a1', priority: 'Medium', automation: 'not_automated', auto_result: null, manual_result: null, ...x })

describe('test case progress', () => {
  it('counts what is automated and what is left to test by hand', () => {
    const n = count([
      c({ automation: 'automated', auto_result: 'passed' }), // covered by automation
      c({ automation: 'automated', auto_result: 'failed', manual_result: 'passed' }),
      c({ priority: 'High', automation: 'automated', auto_result: 'passed' }), // High: still needs a person
      c({}),
    ])
    expect(n).toMatchObject({ cases: 4, automated: 3, autoRun: 3, autoPassed: 2, needManual: 3, manualDone: 1, manualPassed: 1, untested: 2 })
  })

  it('gives each page a writing status and flags late ones', () => {
    const areas = [
      { id: 'a1', zone: 'Engine', page: 'Admin', sort: 2, cases_done_on: '2026-11-03', due_on: null },
      { id: 'a2', zone: 'My Flow', page: 'Create', sort: 3, due_on: '2026-11-07' },
      { id: 'a3', zone: 'Data Exporter', page: 'APIs', sort: 4, due_on: '2026-11-07' },
      { id: 'a4', zone: 'Ask MAIA', page: 'Ask MAIA', sort: 5, in_release: false },
    ]
    const pages = pageProgress(areas, [c({ area_id: 'a1' }), c({ area_id: 'a2' })], '2026-11-10')
    expect(pages.map((p) => [p.page, p.writing, p.late])).toEqual([
      ['Admin', 'done', false],
      ['Create', 'writing', true],
      ['APIs', 'not_started', true],
    ])
    const auto = pageProgress([{ id: 'a1', zone: 'E', page: 'P', sort: 1, automate_due_on: '2026-11-07' }, { id: 'a2', zone: 'E', page: 'Q', sort: 2, automate_due_on: '2026-11-07' }],
      [c({ area_id: 'a1', automation: 'automated' }), c({ area_id: 'a2' })], '2026-11-10')
    expect(auto.map((p) => p.automateLate)).toEqual([false, true])
    expect(auto.map((p) => pageStatus(p).automation)).toEqual(['Fully automated', 'Late'])
    expect(pages.map((p) => pageStatus(p).writing)).toEqual(['Completed', 'Late', 'Late'])
    expect(pages.map((p) => pageStatus(p).hand)).toEqual(['Not started', 'Not started', 'Nothing to test'])
    expect(pct(1, 3)).toBe(33)
    expect(pct(1, 0)).toBe(0)
  })
})
