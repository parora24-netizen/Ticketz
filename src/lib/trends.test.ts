import { describe, expect, it } from 'vitest'
import { casesTestedByDay, days, istDate, openTicketsByDay } from './trends'

describe('trends', () => {
  it('lists every day in a range and reads dates in India time', () => {
    expect(days('2026-10-08', '2026-10-10')).toEqual(['2026-10-08', '2026-10-09', '2026-10-10'])
    expect(istDate('2026-10-15T20:00:00Z')).toBe('2026-10-16') // 01:30 IST next day
  })

  it('counts open Critical/High tickets per day through close and reopen', () => {
    const tickets = [
      { id: 'a', severity: 'High', logged_on: '2026-10-08', state: 'reopened' },
      { id: 'b', severity: 'Critical', logged_on: '2026-10-09', state: 'new' },
      { id: 'c', severity: 'Low', logged_on: '2026-10-08', state: 'new' },
    ]
    const events = [
      { ticket_id: 'a', to_state: 'new', at: '2026-10-08T05:00:00Z' },
      { ticket_id: 'a', to_state: 'closed', at: '2026-10-09T05:00:00Z' },
      { ticket_id: 'a', to_state: 'reopened', at: '2026-10-10T05:00:00Z' },
    ]
    const s = openTicketsByDay(tickets, events, ['Critical', 'High'], '2026-10-08', '2026-10-10')
    expect(s.map((p) => p.value)).toEqual([1, 1, 2])
  })

  it('counts distinct cases tested so far', () => {
    const runs = [
      { case_id: 'x', result: 'passed', recorded_at: '2026-10-16T06:00:00Z' },
      { case_id: 'x', result: 'failed', recorded_at: '2026-10-17T06:00:00Z' },
      { case_id: 'y', result: 'passed', recorded_at: '2026-10-17T07:00:00Z' },
    ]
    expect(casesTestedByDay(runs, '2026-10-15', '2026-10-17').map((p) => p.value)).toEqual([0, 1, 2])
  })
})
