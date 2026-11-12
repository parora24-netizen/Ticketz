import { describe, expect, it } from 'vitest'
import { RunStart, RunUpdate, countsByPage, delta, notTestedReasons, resultOf, waitsBySite, type RunResultRow } from './runs'

const r = (x: Partial<RunResultRow>): RunResultRow => ({ tc_id: 'TC_1', zone: 'Engine', page: 'Admin', result: 'passed', outcome: null, duration_ms: 1000, not_tested_reason: null, error_head: null, note: null, title: '', ...x })

describe('suite runs', () => {
  it('takes a run as the runner posts it, and refuses unknown fields', () => {
    expect(RunStart.parse({ run_id: 'overnight-1', workers: 4, tests_planned: 2051 }).kind).toBe('full')
    expect(RunStart.safeParse({ run_id: 'x', colour: 'red' }).success).toBe(false)
    expect(RunUpdate.safeParse({ exit: 'killed', wall_min: 431 }).success).toBe(true)
    expect(RunUpdate.safeParse({}).success).toBe(false)
  })
  it('counts a finer outcome as one of the results Launchpad knows', () => {
    expect(resultOf('timed_out', 'failed')).toBe('failed')
    expect(resultOf('not_tested', 'skipped')).toBe('skipped')
    expect(resultOf(undefined, 'known_defect')).toBe('known_defect')
  })
  it('counts by page and groups why tests were not tested', () => {
    const rows = [r({}), r({ tc_id: 'TC_2', result: 'failed' }), r({ tc_id: 'TC_3', result: 'skipped', not_tested_reason: 'no engine' }), r({ tc_id: 'TC_4', page: 'Alerts', result: 'skipped', not_tested_reason: 'no engine' })]
    expect(countsByPage(rows)).toMatchObject([{ page: 'Admin', passed: 1, failed: 1, not_tested: 1 }, { page: 'Alerts', not_tested: 1 }])
    expect(notTestedReasons(rows)).toEqual([{ reason: 'no engine', n: 2 }])
  })
  it('summarises waits by site, the costliest first', () => {
    const w = waitsBySite([{ site: 'toast', ms: 100 }, { site: 'engine_open', ms: 50000 }, { site: 'engine_open', ms: 10000 }])
    expect(w[0]).toMatchObject({ site: 'engine_open', n: 2, max: 50000, total: 60000 })
  })
  it('says what changed since the previous run', () => {
    const d = delta(
      [{ tc_id: 'A', result: 'failed', duration_ms: 1 }, { tc_id: 'B', result: 'passed', duration_ms: 20000 }, { tc_id: 'C', result: 'passed', duration_ms: 1000 }],
      [{ tc_id: 'A', result: 'passed', duration_ms: 1 }, { tc_id: 'B', result: 'failed', duration_ms: 5000 }, { tc_id: 'C', result: 'passed', duration_ms: 900 }],
    )
    expect(d).toEqual({ newFailures: ['A'], fixed: ['B'], slower: [{ tc_id: 'B', before: 5000, now: 20000 }] })
  })
})
