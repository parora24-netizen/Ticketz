import { describe, expect, it } from 'vitest'
import { ResultsPayload, bearer, lastPerCase } from './results'

describe('results payload', () => {
  const ok = { build: 'b39a5eab1', run_id: 'run-42', results: [{ tc_id: 'TC_FN_070', status: 'passed' }] }

  it('accepts a normal run', () => {
    expect(ResultsPayload.safeParse(ok).success).toBe(true)
  })

  it('rejects bad ids, statuses and links', () => {
    expect(ResultsPayload.safeParse({ ...ok, results: [{ tc_id: 'FN_070', status: 'passed' }] }).success).toBe(false)
    expect(ResultsPayload.safeParse({ ...ok, results: [{ tc_id: 'TC_FN_070', status: 'blocked' }] }).success).toBe(false)
    expect(ResultsPayload.safeParse({ ...ok, results: [{ tc_id: 'TC_FN_070', status: 'failed', url: 'javascript:alert(1)' }] }).success).toBe(false)
    expect(ResultsPayload.safeParse({ ...ok, results: [] }).success).toBe(false)
    expect(ResultsPayload.safeParse({ ...ok, build: '' }).success).toBe(false)
  })

  it('reads the bearer token', () => {
    expect(bearer('Bearer vqt_abc')).toBe('vqt_abc')
    expect(bearer('bearer  vqt_abc')).toBe('vqt_abc')
    expect(bearer('Basic xyz')).toBeNull()
    expect(bearer(null)).toBeNull()
  })

  it('keeps the last result when a test is reported twice', () => {
    const r = lastPerCase([
      { tc_id: 'tc_fn_070', status: 'failed' },
      { tc_id: 'TC_FN_070', status: 'passed' },
      { tc_id: 'TC_FN_071', status: 'skipped' },
    ])
    expect(r).toEqual([{ tc_id: 'TC_FN_070', status: 'passed' }, { tc_id: 'TC_FN_071', status: 'skipped' }])
  })
})
