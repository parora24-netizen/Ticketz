import { describe, expect, it } from 'vitest'
import { byDay, changeEntries, fmtDuration, minutesSince, moveEntries, sessionMinutes, type ChangeRow } from './activity'

const names = new Map([['p1', 'Uday'], ['a1', 'Engine · Admin']])
const row = (r: Partial<ChangeRow>): ChangeRow => ({ id: 1, table_name: 'test_cases', row_id: 'r', label: 'TC_FN_070', action: 'update', changes: {}, actor_id: 'p1', at: '2026-10-21T05:00:00Z', ...r })

describe('activity', () => {
  it('times sessions from first to last ping, plus a minute', () => {
    expect(sessionMinutes({ started_at: '2026-10-21T04:00:00Z', last_at: '2026-10-21T04:00:00Z' })).toBe(1)
    expect(sessionMinutes({ started_at: '2026-10-21T04:00:00Z', last_at: '2026-10-21T06:44:00Z' })).toBe(165)
    expect(fmtDuration(165)).toBe('2 h 45 m')
    expect(fmtDuration(120)).toBe('2 h')
  })

  it('shows each changed field before and after, naming ids', () => {
    const [e] = changeEntries([row({ changes: { priority: ['High', 'Critical'], tester_id: [null, 'p1'], area_id: ['x', 'a1'], updated_at: ['a', 'b'] } })], names)
    expect(e).toMatchObject({ what: 'edited test case', ref: 'TC_FN_070', href: '/cases/TC_FN_070' })
    expect(e.fields).toEqual([
      { field: 'Priority', before: 'High', after: 'Critical' },
      { field: 'Tester', before: '—', after: 'Uday' },
      { field: 'Area', before: 'x', after: 'Engine · Admin' },
    ])
  })

  it('leaves ticket state and owner changes, and ticket inserts, to the ticket history', () => {
    const rows = [
      row({ id: 1, table_name: 'tickets', label: 'DEV-1', changes: { state: ['new', 'triaged'], owner_id: [null, 'p1'] } }),
      row({ id: 2, table_name: 'tickets', label: 'DEV-1', changes: { state: ['new', 'in_fix'], severity: ['High', 'Low'] } }),
      row({ id: 3, table_name: 'tickets', label: 'DEV-2', action: 'insert', changes: { title: 'x' } }),
    ]
    const out = changeEntries(rows, names)
    expect(out).toHaveLength(1)
    expect(out[0].fields).toEqual([{ field: 'Severity', before: 'High', after: 'Low' }])
  })

  it('words ticket moves and groups everything by day, newest first', () => {
    const moves = moveEntries([
      { id: 1, from_state: null, to_state: 'new', note: null, actor_id: 'p1', at: '2026-10-20T05:00:00Z', key: 'DEV-1' },
      { id: 2, from_state: 'new', to_state: 'triaged', note: null, actor_id: 'p1', at: '2026-10-21T05:00:00Z', key: 'DEV-1' },
    ], (s) => s.toUpperCase())
    expect(moves.map((m) => m.what)).toEqual(['opened ticket', 'NEW → TRIAGED'])
    expect(byDay(moves).map((d) => d.entries.length)).toEqual([1, 1])
    expect(byDay(moves)[0].entries[0].key).toBe('m2')
  })
})

describe('time in a window', () => {
  it('counts only the part of a session inside the window', () => {
    const s = { started_at: '2026-10-21T18:00:00Z', last_at: '2026-10-21T18:59:00Z' }
    expect(minutesSince(s, new Date('2026-10-21T00:00:00Z'))).toBe(60)
    expect(minutesSince(s, new Date('2026-10-21T18:30:00Z'))).toBe(30)
    expect(minutesSince(s, new Date('2026-10-21T19:30:00Z'))).toBe(0)
  })
})
