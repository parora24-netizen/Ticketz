import { describe, expect, it } from 'vitest'
import { indiaDay, indiaDayStart, indiaNextDayStart, summarizeChanges, summarizeResults, type ChangeItem, type ChangeRow } from './history'

const row = (row_id: string, changes: ChangeRow['changes'], at = '2026-11-05T15:44:30Z', action = 'update', actor_id: string | null = null): ChangeRow => ({ row_id, action, at, actor_id, changes })
const items = new Map<string, ChangeItem>([
  ['a', { id: 'TC_1', area: 'Engine · Admin', current: 'automated' }],
  ['b', { id: 'TC_2', area: 'My Flow · Data Flow', current: 'automated' }],
  ['c', { id: 'TC_3', area: 'Engine · Admin', current: 'not_automated' }],
])
const names = (id: string | null) => (id === 'p1' ? 'Sara' : null)

describe('history', () => {
  it('counts days in India time', () => {
    expect(indiaDayStart('2026-11-05')).toBe('2026-11-04T18:30:00.000Z')
    expect(indiaNextDayStart('2026-11-05')).toBe('2026-11-05T18:30:00.000Z')
    expect(indiaDay('2026-11-05T19:00:00Z')).toBe('2026-11-06')
  })

  it('counts changes of one field to a value, and how many stuck', () => {
    const rows = [
      row('a', { automation: ['not_automated', 'automated'] }),
      row('b', { automation: ['not_automated', 'automated'], automation_ref: [null, 'x.ts'] }),
      row('c', { automation: ['not_automated', 'automated'] }),
      row('c', { automation: ['automated', 'not_automated'] }, '2026-11-06T01:00:00Z'),
      row('a', { title: ['Old', 'New'] }),
    ]
    const s = summarizeChanges(rows, items, names, { field: 'automation', to: 'automated' })
    expect(s).toMatchObject({ changes: 3, items: 3, still_that_value: 2, by_day: { '2026-11-05': 3 }, by_area: { 'Engine · Admin': 2, 'My Flow · Data Flow': 1 }, by_change: { 'not_automated -> automated': 3 } })
    expect(summarizeChanges(rows, items, names, { field: 'automation', from: 'automated' }).changes).toBe(1)
  })

  it('narrows by zone and page, and flags what has since gone', () => {
    const rows = [row('a', { automation: ['x', 'y'] }), row('b', { automation: ['x', 'y'] }), row('gone', { automation: ['x', 'y'] })]
    expect(summarizeChanges(rows, items, names, { zone: 'engine' }).items).toBe(1)
    expect(summarizeChanges(rows, items, names, { page: 'data flow' }).items).toBe(1)
    expect(summarizeChanges(rows, items, names, {}).by_area).toMatchObject({ '(since deleted)': 1 })
  })

  it('without a field says what kinds of change there were, and who made them', () => {
    const s = summarizeChanges([row('a', { title: ['a', 'b'] }, undefined, 'update', 'p1'), row('b', null, undefined, 'insert')], items, names, {})
    expect(s).toMatchObject({ by_action: { update: 1, insert: 1 }, by_field: { title: 1 } })
    expect(s.by_person).toEqual({ Sara: 1, 'automation or a system change': 1 })
  })

  it('finds nothing rather than a wrong count when no change matches', () => {
    expect(summarizeChanges([row('a', { title: ['a', 'b'] })], items, names, { field: 'automation' })).toMatchObject({ changes: 0, items: 0 })
  })

  it('summarizes results', () => {
    const r = (case_id: string, result: string, run_id: string | null) => ({ case_id, result, run_id, recorded_at: '2026-11-05T01:00:00Z', who: null })
    const s = summarizeResults([r('a', 'passed', 'r1'), r('a', 'failed', 'r2'), r('b', 'passed', 'r2')], (id) => items.get(id)?.area ?? null)
    expect(s).toMatchObject({ results: 3, cases: 2, runs: 2, by_result: { passed: 2, failed: 1 } })
  })
})
