import { describe, expect, it } from 'vitest'
import { caseLinkLabel, casesHref, matchesCaseLink } from './case-links'

const c = (x: object = {}) => ({ area_id: 'a', priority: 'Medium' as const, automation: 'not_automated' as const, auto_result: null, manual_result: null, open_fix: 0, awaiting_retest: 0, ...x })

describe('links to the cases behind a number', () => {
  it('uses the same pass and fail as the counts', () => {
    const failing = c({ auto_result: 'failed', manual_result: 'passed' })
    expect(matchesCaseLink(failing, { outcome: 'failed' })).toBe(true)
    expect(matchesCaseLink(failing, { outcome: 'passed' })).toBe(false)
    expect(matchesCaseLink(c({ manual_result: 'blocked' }), { outcome: 'failed' })).toBe(false)
    expect(matchesCaseLink(c({ manual_result: 'blocked' }), { outcome: 'none' })).toBe(true)
    expect(matchesCaseLink(failing, { outcome: 'none' })).toBe(false)
  })
  it('counts hand testing only for cases that need it', () => {
    const covered = c({ automation: 'automated', auto_result: 'passed', manual_result: 'passed' })
    expect(matchesCaseLink(covered, { hand: 'tested' })).toBe(false)
    expect(matchesCaseLink(c(), { hand: 'left' })).toBe(true)
    expect(matchesCaseLink(c({ manual_result: 'failed' }), { hand: 'tested' })).toBe(true)
    expect(matchesCaseLink(c({ manual_result: 'failed' }), { hand: 'passed' })).toBe(false)
  })
  it('narrows by automation, priority and failures with no ticket', () => {
    expect(matchesCaseLink(c({ automation: 'automated', auto_result: 'failed' }), { auto: 'passed' })).toBe(false)
    expect(matchesCaseLink(c({ priority: 'High' }), { priority: 'high' })).toBe(true)
    expect(matchesCaseLink(c(), { priority: 'high' })).toBe(false)
    expect(matchesCaseLink(c({ manual_result: 'failed' }), { untracked: '1' })).toBe(true)
    expect(matchesCaseLink(c({ manual_result: 'failed', open_fix: 1 }), { untracked: '1' })).toBe(false)
    expect(matchesCaseLink(c({ needs_detail: true }), { needs_detail: '1' })).toBe(true)
    expect(matchesCaseLink(c({ needs_detail: false }), { needs_detail: '1' })).toBe(false)
    expect(matchesCaseLink(c({ automation_block: 'needs_server' }), { block: 'needs_server' })).toBe(true)
  })
  it('builds the link and names it', () => {
    expect(casesHref({ sprint: 's1', outcome: 'failed' })).toBe('/cases?sprint=s1&outcome=failed')
    expect(casesHref({})).toBe('/cases')
    expect(caseLinkLabel({ priority: 'high', outcome: 'failed' })).toBe('Critical and High · Failed')
  })
})
