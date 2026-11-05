import { describe, expect, it } from 'vitest'
import { fixSprintAfter, fixSprintForArea, followsPage } from './fix-sprint'

const s = (id: string, kind: string, status = 'planned') => ({ id, name: id, kind, status })
const sprints = [s('T1', 'test', 'active'), s('F1', 'fix', 'active'), s('T2', 'test'), s('F2', 'fix'), s('T3', 'test'), s('F3', 'fix', 'closed'), s('R1', 'regression')]

describe('tickets following a moved page', () => {
  it('leaves tickets in the running sprint where they are', () => {
    const plan = [s('S1', 'fix', 'active'), s('S2', 'fix'), s('F1', 'fix', 'closed')]
    expect(followsPage({ current_sprint_id: 'S1' }, plan)).toBe(false)
    expect(followsPage({ current_sprint_id: 'S2' }, plan)).toBe(true)
    expect(followsPage({ current_sprint_id: null }, plan)).toBe(true)
  })
})

describe('fix sprint after a test sprint', () => {
  it('pairs Tn with F(n+1)', () => {
    expect(fixSprintAfter(sprints[0], sprints)?.name).toBe('F2')
    expect(fixSprintAfter(sprints[2], sprints)).toBeNull() // F3 has closed
    expect(fixSprintAfter(sprints[1], sprints)).toBeNull() // not a test sprint
    expect(fixSprintAfter(sprints[6], sprints)).toBeNull()
  })

  it("follows a page's open test sprint", () => {
    const sa = [{ sprint_id: 'T1', area_id: 'a' }, { sprint_id: 'R1', area_id: 'a' }, { sprint_id: 'R1', area_id: 'b' }]
    expect(fixSprintForArea('a', sprints, sa)?.name).toBe('F2')
    expect(fixSprintForArea('b', sprints, sa)).toBeNull()
    expect(fixSprintForArea(null, sprints, sa)).toBeNull()
  })

  it("prefers the fix sprint the plan gives the page", () => {
    const plan = [s('S0', 'triage', 'active'), s('S1', 'fix'), s('S2', 'fix'), s('S6', 'regression')]
    const sa = [{ sprint_id: 'S2', area_id: 'a' }, { sprint_id: 'S6', area_id: 'a' }]
    expect(fixSprintForArea('a', plan, sa)?.name).toBe('S2')
    expect(fixSprintForArea('a', [s('S2', 'fix', 'closed'), s('S6', 'regression')], sa)).toBeNull()
    // Fixes that start early, in S0, go there until S0 closes.
    const early = [...sa, { sprint_id: 'S0', area_id: 'a' }]
    expect(fixSprintForArea('a', plan, early)?.name).toBe('S0')
    expect(fixSprintForArea('a', [s('S0', 'triage', 'closed'), ...plan.slice(1)], early)?.name).toBe('S2')
  })
})
