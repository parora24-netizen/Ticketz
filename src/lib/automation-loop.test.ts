import { describe, expect, it } from 'vitest'
import { AskPatch, CaseAutomation, askStatus, feedEvents, holdActive, retestPasses, type ChangeRow } from './automation-loop'

const row = (x: Partial<ChangeRow>): ChangeRow => ({ id: 1, table_name: 'test_cases', row_id: 'r', label: 'TC_1', action: 'update', changes: {}, at: '2026-11-10T00:00:00Z', ...x })

describe('the change feed', () => {
  it('turns case edits into what the runner acts on', () => {
    const ev = feedEvents([
      row({ id: 5, changes: { expected: ['a', 'b'], revision: [1, 2] } }),
      row({ id: 6, changes: { automation: ['blocked', 'automated'] } }),
      row({ id: 7, changes: { tester_id: ['x', 'y'] } }), // nothing a runner needs
      row({ id: 8, action: 'insert', changes: {} }),
    ], new Map(), new Map())
    expect(ev.map((e) => [e.cursor, e.type])).toEqual([[5, 'case.text_changed'], [6, 'case.automation_changed'], [8, 'case.created']])
    expect(ev[0]).toMatchObject({ tc_id: 'TC_1', revision: 2 })
  })
  it('names an ask by its kind and what happened to it', () => {
    const asks = new Map([['a1', { key: 'ASK-1', kind: 'need' as const }], ['a2', { key: 'ASK-2', kind: 'question' as const }]])
    const ev = feedEvents([
      row({ table_name: 'asks', row_id: 'a1', label: 'ASK-1', changes: { state: ['open', 'done'] } }),
      row({ table_name: 'asks', row_id: 'a2', label: 'ASK-2', changes: { state: ['open', 'done'] } }),
      row({ table_name: 'tickets', label: 'DEV-4', changes: { state: ['in_fix', 'ready_for_retest'] } }),
      row({ table_name: 'automation_prs', label: 'e2e#9', changes: { state: ['open', 'merged'] } }),
    ], asks, new Map())
    expect(ev.map((e) => e.type)).toEqual(['need.provided', 'question.answered', 'ticket.state_changed', 'pr.merged'])
  })
  it('reports a screen hold by its page', () => {
    const ev = feedEvents([row({ table_name: 'areas', row_id: 'p', label: null, changes: { automation_hold_reason: [null, 'D219'] } })], new Map(), new Map([['p', { zone: 'Engine', page: 'Admin' }]]))
    expect(ev).toMatchObject([{ type: 'screen.hold_changed', zone: 'Engine', page: 'Admin' }])
  })
})

describe('closing retests from results', () => {
  const seen = new Map([['b1', '2026-11-01'], ['b2', '2026-11-03']])
  it('passes on the fixed build or a later one, after the fix was handed over', () => {
    const t = { fixedBuild: 'b1', readyAt: '2026-11-02' }
    expect(retestPasses(t, { build: 'b1', at: '2026-11-04' }, seen)).toBe(true)
    expect(retestPasses(t, { build: 'b2', at: '2026-11-04' }, seen)).toBe(true)
    expect(retestPasses({ fixedBuild: 'b2', readyAt: null }, { build: 'b1', at: '2026-11-04' }, seen)).toBe(false)
    expect(retestPasses(t, { build: 'b2', at: '2026-11-01' }, seen)).toBe(false) // before the handover
  })
  it('falls back to time when the fixed build is not one the runs carry', () => {
    expect(retestPasses({ fixedBuild: '26.111.4', readyAt: '2026-11-02' }, { build: 'b2', at: '2026-11-04' }, seen)).toBe(true)
  })
})

describe('asks and holds', () => {
  it('speaks each kind\'s words for its state', () => {
    expect(askStatus('need', 'open')).toBe('requested')
    expect(askStatus('need', 'done')).toBe('provided')
    expect(askStatus('decision', 'done')).toBe('decided')
    expect(AskPatch.parse({ state: 'provided' }).state).toBe('done')
    expect(AskPatch.parse({ state: 'requested' }).state).toBe('open')
  })
  it('keeps a screen held while its defect is open', () => {
    expect(holdActive({ hasTicket: true, ticketState: 'in_fix' }, '2026-11-10')).toBe(true)
    expect(holdActive({ hasTicket: true, ticketState: 'closed' }, '2026-11-10')).toBe(false)
    expect(holdActive({ hasTicket: true, ticketState: 'in_fix', until: '2026-11-09' }, '2026-11-10')).toBe(false)
    expect(holdActive({ hasTicket: false, until: '2026-11-12' }, '2026-11-10')).toBe(true)
  })
  it('lets a runner propose "not automatable" but not set it', () => {
    expect(CaseAutomation.safeParse({ automation_status: 'not_automatable' }).success).toBe(false)
    expect(CaseAutomation.safeParse({ automation_proposed: 'not_automatable', automation_proposed_reason: 'needs a person' }).success).toBe(true)
  })
})
