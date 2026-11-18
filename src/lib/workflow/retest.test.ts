import { describe, expect, it } from 'vitest'
import { readyTimes, retestOwner } from './retest'

const base = { testerId: 'uday', ownerId: 'juan', ownerIsDev: false, automated: true, manualResult: 'passed', manualAt: '2026-11-18T05:52', readyAt: '2026-11-18T04:59' }

describe('who a retest is with', () => {
  it('moves to the owner once the tester passes it by hand after the fix', () => {
    expect(retestOwner(base)).toEqual({ id: 'juan', waitingOnAutomation: true })
  })
  it('stays with the tester until then', () => {
    expect(retestOwner({ ...base, manualAt: '2026-11-17T12:39' }).id).toBe('uday')
    expect(retestOwner({ ...base, manualResult: 'failed' }).id).toBe('uday')
    expect(retestOwner({ ...base, readyAt: null }).id).toBe('uday')
  })
  it('stays with the tester for a manual-only case or a dev owner', () => {
    expect(retestOwner({ ...base, automated: false }).id).toBe('uday')
    expect(retestOwner({ ...base, ownerIsDev: true }).id).toBe('uday')
    expect(retestOwner({ ...base, ownerId: null }).id).toBe('uday')
  })
  it('takes the latest real move into Ready for retest', () => {
    const t = readyTimes([
      { ticket_id: 'a', from_state: 'in_fix', to_state: 'ready_for_retest', at: '2026-11-16T10:00' },
      { ticket_id: 'a', from_state: 'ready_for_retest', to_state: 'ready_for_retest', at: '2026-11-18T05:45' },
      { ticket_id: 'a', from_state: 'in_fix', to_state: 'ready_for_retest', at: '2026-11-18T04:59' },
    ])
    expect(t.get('a')).toBe('2026-11-18T04:59')
  })
})
