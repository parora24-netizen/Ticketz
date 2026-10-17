import { describe, expect, it } from 'vitest'
import { addWorkingDays, planExtension } from './schedule'

describe('working days', () => {
  it('skips weekends both ways', () => {
    expect(addWorkingDays('2026-10-21', 2)).toBe('2026-10-23') // Wed -> Fri
    expect(addWorkingDays('2026-10-23', 1)).toBe('2026-10-26') // Fri -> Mon
    expect(addWorkingDays('2026-10-26', -1)).toBe('2026-10-23') // Mon -> Fri
    expect(addWorkingDays('2026-10-21', 0)).toBe('2026-10-21')
  })
})

describe('extending a sprint', () => {
  const sprints = [
    { id: 's1', name: 'S1', starts_on: '2026-10-19', ends_on: '2026-10-21', status: 'active' },
    { id: 's2', name: 'S2', starts_on: '2026-10-22', ends_on: '2026-10-27', status: 'planned' },
    { id: 's11', name: 'S11', starts_on: '2026-11-27', ends_on: '2026-12-01', status: 'planned' },
  ]
  const release = { release_on: '2026-12-04', go_no_go_on: '2026-12-03' }

  it('moves only the sprint when not cascading', () => {
    const p = planExtension(sprints, 's1', 2, false, release)
    expect(p.sprints).toEqual([{ id: 's1', name: 'S1', starts_on: '2026-10-19', ends_on: '2026-10-23' }])
    expect(p.release).toEqual(release)
  })

  it('shifts later sprints, and the release when the last sprint runs into go/no-go', () => {
    const p = planExtension(sprints, 's1', 2, true, release)
    expect(p.sprints.map((s) => `${s.name} ${s.starts_on}→${s.ends_on}`)).toEqual([
      'S1 2026-10-19→2026-10-23',
      'S2 2026-10-26→2026-10-29',
      'S11 2026-12-01→2026-12-03',
    ])
    expect(p.release).toEqual({ release_on: '2026-12-08', go_no_go_on: '2026-12-07' })
  })

  it('keeps the release when there is slack before go/no-go', () => {
    const p = planExtension(sprints.slice(0, 2), 's1', 1, true, release)
    expect(p.release).toEqual(release)
  })
})
