import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { TRANSITIONS, allowedMoves, canMove, requiredFor, retestResult, type Role, type TicketState } from './ticket-machine'
import { caseStage, mismatch, needsTicket, type CaseForStage, testBy, testStage } from './case-stage'
import { sprintGate, gateFor } from './sprint-gate'

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
  open_fix: 0,
  awaiting_retest: 0,
}

describe('case stage', () => {
  it('walks a case through the board', () => {
    expect(caseStage({ ...base, automation: 'not_automated' })).toBe('test')
    expect(caseStage(base)).toBe('test')
    expect(caseStage({ ...base, auto_result: 'failed' })).toBe('test')
    expect(caseStage({ ...base, auto_result: 'failed', manual_result: 'failed' })).toBe('fix')
    expect(caseStage({ ...base, auto_result: 'failed', manual_result: 'failed', open_fix: 1 })).toBe('fix')
    expect(caseStage({ ...base, manual_result: 'failed', awaiting_retest: 1 })).toBe('retest')
    expect(caseStage({ ...base, auto_result: 'passed' })).toBe('done')
  })

  it('says how a case in To test gets tested', () => {
    expect(testBy(base)).toBe('auto')
    expect(testBy({ ...base, auto_result: 'failed' })).toBe('manual')
    expect(testBy({ ...base, automation: 'not_automated' })).toBe('manual')
  })

  it('counts earlier real results for Critical and High cases too', () => {
    const high = { ...base, priority: 'High' as const }
    expect(caseStage({ ...high, auto_result: 'passed' })).toBe('test')
    expect(caseStage({ ...high, auto_result: 'passed', manual_result: 'passed' })).toBe('done')
  })

  it('places cases on a test sprint board', () => {
    expect(testStage({ ...base, automation: 'not_automated', priority: 'Low' })).toBe('automate')
    expect(testStage({ ...base, automation: 'not_automated', priority: 'High' })).toBe('test')
    expect(testStage(base)).toBe('test')
    expect(testStage({ ...base, auto_result: 'passed' })).toBe('passed')
    expect(testStage({ ...base, auto_result: 'failed', manual_result: 'failed' })).toBe('failed')
    expect(testStage({ ...base, auto_result: 'passed', open_fix: 1 })).toBe('failed')
  })

  it('treats manual-only cases as manual work', () => {
    expect(caseStage({ ...base, automation: 'manual_only' })).toBe('test')
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

describe('gate by sprint type', () => {
  it('test sprints need every area written and every case through testing', () => {
    const g = gateFor('test', { cases: [{ ...base, auto_result: 'passed' }], tickets: [], emptyAreas: 2 })
    expect(g.ok).toBe(false)
    expect(g.checks.find((c) => !c.ok)?.detail).toBe('2 areas have no cases yet')
  })
  it('fix sprints need their tickets triaged and closed', () => {
    const g = gateFor('fix', { cases: [], tickets: [{ state: 'in_fix', severity: 'High' }, { state: 'closed', severity: 'Critical' }] })
    expect(g.checks.map((c) => c.ok)).toEqual([true, false])
  })
  it('triage sprints only need their tasks', () => {
    expect(gateFor('triage', { cases: [], tickets: [], tasks: [{ status: 'done' }] }).ok).toBe(true)
  })
})
