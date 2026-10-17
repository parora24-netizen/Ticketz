import { describe, expect, it } from 'vitest'
import { buildStandup, lastWorkingDayStart, workingDaysBetween } from './standup'

// 10:00 India time on Monday 19 Oct 2026 = 04:30 UTC
const monday = new Date('2026-10-19T04:30:00Z')
const wednesday = new Date('2026-10-21T04:30:00Z')

describe('standup dates', () => {
  it('reaches back to Friday on a Monday and to the day before mid-week', () => {
    expect(lastWorkingDayStart(monday).toISOString()).toBe('2026-10-15T18:30:00.000Z') // Fri 16 Oct 00:00 IST
    expect(lastWorkingDayStart(wednesday).toISOString()).toBe('2026-10-19T18:30:00.000Z') // Tue 20 Oct 00:00 IST
  })

  it('counts working days, skipping the weekend', () => {
    expect(workingDaysBetween(new Date('2026-10-16T06:00:00Z'), monday)).toBe(1) // Fri -> Mon
    expect(workingDaysBetween(new Date('2026-10-15T06:00:00Z'), monday)).toBe(2) // Thu -> Mon
    expect(workingDaysBetween(monday, monday)).toBe(0)
  })
})

describe('standup cards', () => {
  const people = [
    { id: 'dev1', name: 'Amit', role: 'dev' as const },
    { id: 'qa1', name: 'Uday', role: 'qa' as const },
  ]
  const tickets = [
    { id: '1', key: 'DEV-1', title: 'Fixing', state: 'in_fix', severity: 'High', owner_id: 'dev1', updated_at: '2026-10-19T03:00:00Z' },
    { id: '2', key: 'DEV-2', title: 'Stale', state: 'in_fix', severity: 'High', owner_id: 'dev1', updated_at: '2026-10-14T06:00:00Z' },
    { id: '3', key: 'DEV-3', title: 'Bounced', state: 'reopened', severity: 'Critical', owner_id: 'dev1', updated_at: '2026-10-16T06:00:00Z' },
    { id: '4', key: 'DEV-4', title: 'Retest me', state: 'ready_for_retest', severity: 'Medium', owner_id: 'dev1', updated_at: '2026-10-16T06:00:00Z' },
    { id: '5', key: 'DEV-5', title: 'Nobody', state: 'new', severity: 'Critical', owner_id: null, updated_at: '2026-10-16T06:00:00Z' },
    { id: '6', key: 'DEV-6', title: 'Nobody low', state: 'new', severity: 'Low', owner_id: null, updated_at: '2026-10-16T06:00:00Z' },
  ]
  const activity = [
    { kind: 'ticket' as const, at: '2026-10-16T08:00:00Z', actor_id: 'dev1', subject_owner_id: 'dev1', ref: 'DEV-4', title: 'Retest me', what: 'in_fix → ready_for_retest', detail: null },
    { kind: 'result' as const, at: '2026-10-15T08:00:00Z', actor_id: 'qa1', subject_owner_id: null, ref: 'TC_FN_070', title: 'Old', what: 'manual passed', detail: null },
    { kind: 'result' as const, at: '2026-10-16T09:00:00Z', actor_id: 'qa1', subject_owner_id: null, ref: 'TC_FN_071', title: 'Recent', what: 'manual failed', detail: null },
  ]
  const tasks = [
    { id: 't1', num: 6, title: 'Fix member error', status: 'in_progress', due_on: '2026-10-23', owner_id: 'dev1' },
    { id: 't2', num: 9, title: 'Landing counts', status: 'blocked', due_on: '2026-10-23', owner_id: 'dev1' },
    { id: 't3', num: 1, title: 'Triage tickets', status: 'not_started', due_on: '2026-10-16', owner_id: 'qa1' },
  ]
  const s = buildStandup({ now: monday, people, activity, tickets, tasks })
  const dev = s.cards[0]
  const qa = s.cards[1]

  it('lists only work done since the last working day started', () => {
    expect(dev.yesterday.map((y) => y.ref)).toEqual(['DEV-4'])
    expect(qa.yesterday.map((y) => y.ref)).toEqual(['TC_FN_071'])
  })

  it('puts open fixes and in-progress tasks under today, and the retest queue for QA', () => {
    expect(dev.today.map((t) => t.ref)).toEqual(['DEV-1', 'DEV-2', '#6'])
    expect(qa.today.map((t) => t.ref)).toEqual(['Retests'])
  })

  it('flags blocked tasks, late tasks, reopened and stale tickets', () => {
    expect(dev.blocked.map((b) => b.ref)).toEqual(['#9', 'DEV-2', 'DEV-3'])
    expect(qa.blocked.map((b) => b.ref)).toEqual(['#1'])
  })

  it('lists unowned open tickets, most severe first', () => {
    expect(s.unassigned.map((u) => u.ref)).toEqual(['DEV-5', 'DEV-6'])
  })
})
