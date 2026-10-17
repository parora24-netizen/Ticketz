import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { TRANSITIONS, allowedMoves, canMove, requiredFor, retestResult, type Role, type TicketState } from './ticket-machine'
import { caseStage, mismatch, needsTicket, type CaseForStage } from './case-stage'
import { sprintGate } from './sprint-gate'

describe('ticket machine', () => {
  it('matches the ticket_transitions rows in the schema migration', () => {
    const sql = readFileSync(path.resolve(__dirname, '../../../supabase/migrations/20261017000100_schema.sql'), 'utf8')
    const block = sql.slice(sql.indexOf('insert into ticket_transitions'), sql.indexOf('create table plan_tasks'))
    const fromSql = [...block.matchAll(/\('(\w+)', '(\w+)', '(\w+)'\)/g)].map((m) => `${m[1]}>${m[2]}>${m[3]}`).sort()
    const fromTs = Object.entries(TRANSITIONS)
      .flatMap(([from, tos]) => Object.entries(tos ?? {}).flatMap(([to, roles]) => (roles ?? []).map((r) => `${from}>${to}>${r}`)))
      .sort()
    expect(fromSql.length).toBeGreaterThan(0)
    expect(fromSql).toEqual(fromTs)
  })

  it('follows the fix and retest loop', () => {
    expect(canMove('new', 'triaged', 'qa')).toBe(true)
    expect(canMove('triaged', 'in_fix', 'dev')).toBe(true)
    expect(canMove('in_fix', 'ready_for_retest', 'dev')).toBe(true)
    expect(canMove('ready_for_retest', 'closed', 'qa')).toBe(true)
    expect(canMove('ready_for_retest', 'reopened', 'qa')).toBe(true)
    expect(canMove('reopened', 'in_fix', 'dev')).toBe(true)
  })

  it('keeps each role to its part', () => {
    const denied: [TicketState, TicketState, Role][] = [
      ['ready_for_retest', 'closed', 'dev'],
      ['in_fix', 'ready_for_retest', 'qa'],
      ['new', 'deferred', 'qa'],
      ['new', 'deferred', 'dev'],
      ['new', 'closed', 'lead'],
      ['closed', 'in_fix', 'dev'],
    ]
    for (const [from, to, role] of denied) expect(canMove(from, to, role), `${role} ${from}->${to}`).toBe(false)
    expect(allowedMoves('new', 'dev')).toEqual(['in_fix'])
    expect(allowedMoves('duplicate', 'lead')).toEqual([])
  })

  it('names what each move needs and which moves are retests', () => {
    expect(requiredFor('ready_for_retest')).toBe('fixed_in_build')
    expect(requiredFor('deferred')).toBe('defer_reason')
    expect(requiredFor('in_fix')).toBeNull()
    expect(retestResult('ready_for_retest', 'closed')).toBe('passed')
    expect(retestResult('ready_for_retest', 'reopened')).toBe('failed')
    expect(retestResult('closed', 'reopened')).toBeNull()
  })
})

const base: CaseForStage = {
  priority: 'Medium',
  automation: 'automated',
  auto_result: null,
  manual_result: null,
  auto_in_sprint: false,
  manual_in_sprint: false,
  open_fix: 0,
  awaiting_retest: 0,
}

describe('case stage', () => {
  it('walks a case through the board', () => {
    expect(caseStage({ ...base, automation: 'not_automated' })).toBe('automate')
    expect(caseStage(base)).toBe('auto_run')
    expect(caseStage({ ...base, auto_result: 'failed', auto_in_sprint: true })).toBe('manual')
    expect(caseStage({ ...base, auto_result: 'failed', manual_result: 'failed', auto_in_sprint: true, manual_in_sprint: true })).toBe('fix')
    expect(caseStage({ ...base, auto_result: 'failed', manual_result: 'failed', open_fix: 1 })).toBe('fix')
    expect(caseStage({ ...base, manual_result: 'failed', awaiting_retest: 1 })).toBe('retest')
    expect(caseStage({ ...base, auto_result: 'passed', auto_in_sprint: true })).toBe('done')
  })

  it('sends Critical and High cases that are not automated straight to manual testing', () => {
    expect(caseStage({ ...base, priority: 'High', automation: 'not_automated' })).toBe('manual')
    expect(caseStage({ ...base, priority: 'Low', automation: 'not_automated' })).toBe('automate')
  })

  it('makes Critical and High cases be tested again inside the sprint', () => {
    const high = { ...base, priority: 'High' as const, auto_result: 'passed' as const, manual_result: 'passed' as const }
    expect(caseStage(high)).toBe('auto_run')
    expect(caseStage({ ...high, auto_in_sprint: true })).toBe('manual')
    expect(caseStage({ ...high, auto_in_sprint: true, manual_in_sprint: true })).toBe('done')
    // Medium can rely on an earlier result.
    expect(caseStage({ ...base, auto_result: 'passed' })).toBe('done')
  })

  it('treats manual-only cases as manual work', () => {
    expect(caseStage({ ...base, automation: 'manual_only' })).toBe('manual')
    expect(caseStage({ ...base, automation: 'manual_only', manual_result: 'passed' })).toBe('done')
  })

  it('flags untracked failures and mismatches', () => {
    expect(needsTicket({ ...base, manual_result: 'failed' })).toBe(true)
    expect(needsTicket({ ...base, manual_result: 'failed', open_fix: 1 })).toBe(false)
    expect(mismatch('passed', 'failed')).toBe('type_ii')
    expect(mismatch('known_defect', 'passed')).toBe('type_i')
    expect(mismatch('passed', 'passed')).toBeNull()
    expect(mismatch(null, 'failed')).toBeNull()
  })
})

describe('sprint gate', () => {
  const done = { ...base, auto_result: 'passed' as const }

  it('lets a Medium ticket still in fix carry over', () => {
    const g = sprintGate([done, done], [{ state: 'in_fix', severity: 'Medium' }, { state: 'closed', severity: 'High' }])
    expect(g.ok).toBe(true)
  })

  it('stays shut for untested cases, untriaged tickets and open High tickets', () => {
    const g = sprintGate([base, { ...base, manual_result: 'failed', auto_result: 'failed' }], [
      { state: 'new', severity: 'Low' },
      { state: 'in_fix', severity: 'Critical' },
    ])
    expect(g.ok).toBe(false)
    expect(g.checks.map((c) => c.ok)).toEqual([false, false, false, false])
  })

  it('passes a clean sprint', () => {
    const g = sprintGate([done], [{ state: 'deferred', severity: 'Critical' }, { state: 'in_fix', severity: 'Low' }])
    expect(g.ok).toBe(true)
  })
})
