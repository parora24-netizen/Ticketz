import { describe, expect, it } from 'vitest'
import { askEmail, digestEmail } from './email-templates'

const ask = { key: 'ASK-3', kind: 'question' as const, title: 'Which approver <account>?', detail: 'For the Approvals cases', due_on: '2026-11-13', answer: null, outcome: null, store: null, state: 'open', cases: ['TC_1', 'TC_2'] }

describe('emails', () => {
  it('tells an owner what was given to them, by when, with a link', () => {
    const m = askEmail(ask, 'assigned', 'Juan', 'Uday', 'https://lp.test')
    expect(m.subject).toBe('ASK-3: Which approver <account>? (due Fri 13 Nov)')
    expect(m.text).toContain('Juan has given you a question, due Fri 13 Nov.')
    expect(m.text).toContain('2 cases waiting: TC_1, TC_2')
    expect(m.html).toContain('https://lp.test/asks/ASK-3')
    expect(m.html).toContain('Which approver &lt;account&gt;?') // escaped
  })
  it('tells whoever raised it that it was answered, with the answer', () => {
    const m = askEmail({ ...ask, kind: 'need', state: 'done', store: '/e2e/mssql', answer: 'Server is up' }, 'answered', 'Niten', 'Juan', 'https://lp.test')
    expect(m.subject).toBe('ASK-3 provided: Which approver <account>?')
    expect(m.text).toContain('Stored in /e2e/mssql')
  })
  it('lists everything waiting, overdue counted, links made absolute', () => {
    const m = digestEmail('Uday', [
      { type: 'question', title: 'ASK-3: Which approver?', href: '/asks/ASK-3', due_on: '2026-11-09', overdue: true },
      { type: 'pr', title: 'Review e2e#9', href: 'https://github.com/x/pull/9', detail: '12 cases' },
    ], 'https://lp.test')
    expect(m.subject).toBe('2 things waiting on you in Launchpad (1 overdue)')
    expect(m.html).toContain('https://lp.test/asks/ASK-3')
    expect(m.html).toContain('https://github.com/x/pull/9')
  })
})
