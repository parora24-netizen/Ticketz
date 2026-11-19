import { describe, expect, it } from 'vitest'
import { askZone } from './ask-zone'

describe('an ask’s zone', () => {
  it('comes from its cases, else from its title', () => {
    expect(askZone(new Set(['Data Hub']), 'anything')).toBe('Data Hub')
    expect(askZone(new Set(['Data Hub', 'Engine']), 'anything')).toBe('Several')
    expect(askZone(undefined, 'Complete the expected result of 4 case(s) on Data Importer › APIs')).toBe('Data Importer')
    expect(askZone(new Set(), 'Q-1 on TC_2459: the test data')).toBe('')
  })
})
