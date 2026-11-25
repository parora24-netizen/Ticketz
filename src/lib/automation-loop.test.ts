import { describe, expect, it } from 'vitest'
import { AskPatch, CaseAutomation, askDisplay, askStatus, closeWith, feedEvents, holdActive, retestPasses, type ChangeRow } from './automation-loop'

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
      row({ table_name: 'asks', row_id: 'a1', label: 'ASK-1', changes: { state: ['open', 'done'], outcome: [null, 'access'] } }),
      row({ table_name: 'asks', row_id: 'a2', label: 'ASK-2', changes: { suite_need: [null, 'Delete a record'] } }),
      row({ table_name: 'tickets', label: 'DEV-4', changes: { state: ['in_fix', 'ready_for_retest'] } }),
      row({ table_name: 'automation_prs', label: 'e2e#9', changes: { state: ['open', 'merged'] } }),
    ], asks, new Map())
    expect(ev.map((e) => e.type)).toEqual(['need.closed', 'question.suite_change', 'ticket.state_changed', 'pr.merged'])
    expect(ev[0]).toMatchObject({ key: 'ASK-1', outcome: 'access' })
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
  it('names how an ask stands: open, waiting on the suite, or its outcome', () => {
    expect(askStatus('need', 'open')).toBe('requested')
    expect(askStatus('question', 'open', null, 'Delete a record')).toBe('suite')
    expect(askStatus('need', 'done', 'access')).toBe('access')
    expect(askDisplay('need', 'open')).toEqual({ state: 'Open', outcome: '' })
    expect(askDisplay('question', 'open', null, 'Delete a record')).toEqual({ state: 'Open', outcome: 'Suite change' })
    expect(askDisplay('question', 'done', 'edited')).toEqual({ state: 'Closed', outcome: 'Cases edited' })
    expect(askDisplay('decision', 'done', 'manual')).toEqual({ state: 'Closed', outcome: 'Manual only' })
  })
  it('closes with one outcome, taking the older words too', () => {
    expect(closeWith('edited')).toEqual({ state: 'done', outcome: 'edited' })
    expect(closeWith('done', 'deferred')).toEqual({ state: 'done', outcome: 'deferred' })
    expect(closeWith('provided')).toEqual({ state: 'done', outcome: 'access' })
    expect(closeWith('decided', 'retire')).toEqual({ state: 'done', outcome: 'manual' })
    expect(closeWith('decided', 'rewrite')).toEqual({ state: 'done', outcome: 'edited' })
    expect(closeWith('requested')).toEqual({ state: 'open', outcome: null })
    expect(closeWith('done').error).toBeTruthy()
    expect(AskPatch.safeParse({ state: 'duplicate', duplicate_of: 'ask-4' }).success).toBe(true)
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
