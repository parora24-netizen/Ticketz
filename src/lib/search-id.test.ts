import { describe, expect, it } from 'vitest'
import { idFromSearch } from './search-id'

describe('ids typed into search', () => {
  it('reads loosely typed ticket keys and case ids', () => {
    for (const q of ['dev 648', 'DEV648', 'dev-648', 'Dev_648', ' dev  648 ']) expect(idFromSearch(q)).toBe('DEV-648')
    expect(idFromSearch('mm 99')).toBe('MM-99')
    expect(idFromSearch('task 3')).toBe('TASK-3')
    for (const q of ['tc 491', 'TC-491', 'tc491', 'TC_491', 'tc_0491']) expect(idFromSearch(q)).toBe('TC_491')
  })
  it('leaves anything else as typed, in capitals', () => {
    expect(idFromSearch('TC_FN_1291')).toBe('TC_FN_1291')
    expect(idFromSearch('password')).toBe('PASSWORD')
    expect(idFromSearch('648')).toBe('648')
  })
})
