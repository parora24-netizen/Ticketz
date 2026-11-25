import { describe, expect, it } from 'vitest'
import { askCommentEmail, digestEmail } from './email-templates'


describe('emails', () => {
  it('tells a tagged person who tagged them, with the comment and a link', () => {
    const m = askCommentEmail({ key: 'ASK-3', title: 'Which approver?' }, '@Uday can you check <this>?', 'Niten', 'Uday', 'tagged', 'https://lp.test')
    expect(m.subject).toBe('Niten tagged you: ASK-3 Which approver?')
    expect(m.html).toContain('&lt;this&gt;')
    expect(m.html).toContain('https://lp.test/asks/ASK-3')
  })
  it('leads the digest with the asks: open, new, overdue and answered ones to close', () => {
    const m = digestEmail('Niten', [
      { type: 'question', title: 'ASK-3: Which approver?', href: '/asks/ASK-3' },
      { type: 'ticket', title: 'DEV-4: Broken', href: '/tickets/DEV-4' },
    ], 'https://lp.test', {
      open: 12, since: '2026-11-24T04:30:00Z',
      fresh: [{ key: 'ASK-9', title: 'Reword TC_1', zone: 'Data Hub' }], overdue: [], toClose: [{ key: 'ASK-2', title: 'Login', outcome: 'Access given' }],
    })
    expect(m.subject).toBe('12 open asks (1 new), 1 to close, 1 other thing · Launchpad')
    expect(m.html).toContain('https://lp.test/asks/ASK-9')
    expect(m.html).toContain('Access given')
    expect(m.html).toContain('DEV-4: Broken')
    expect(m.html).not.toContain('ASK-3: Which approver?') // asks are counted, not listed again
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
