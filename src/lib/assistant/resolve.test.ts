import { describe, expect, it } from 'vitest'
import { resolvePages, resolvePerson, resolveSprint } from './resolve'

const sprints = [{ name: 'S1' }, { name: 'S2' }, { name: 'S4' }]
const people = [{ id: '1', name: 'Niten' }, { id: '2', name: 'Uday' }, { id: '3', name: 'Amit' }, { id: '4', name: 'Amitabh' }]
const areas = [
  { id: 'a', zone: 'Data Exporter', page: 'APIs' }, { id: 'b', zone: 'Data Exporter', page: 'Queries' },
  { id: 'c', zone: 'My Flow', page: 'APIs' }, { id: 'd', zone: 'My Flow', page: 'Create' }, { id: 'e', zone: 'Landing', page: 'Landing' },
]

describe('names in a direction', () => {
  it('reads a sprint however it is said', () => {
    for (const q of ['S4', 's4', 'sprint 4', 'Sprint 4', '4', 'sprint4']) expect(resolveSprint(q, sprints).value).toEqual({ name: 'S4' })
    expect(resolveSprint('not planned', sprints).value).toBeNull()
    expect(resolveSprint('sprint 9', sprints).error).toContain('S1, S2, S4')
  })
  it('reads a person, me and no one', () => {
    expect(resolvePerson('niten', people, '2').value?.id).toBe('1')
    expect(resolvePerson('me', people, '2').value?.name).toBe('Uday')
    expect(resolvePerson('nobody', people, '2').value).toBeNull()
    expect(resolvePerson('Amit', people, '2').value?.id).toBe('3') // an exact name wins
    expect(resolvePerson('ami', people, '2').error).toContain('Amit, Amitabh')
    expect(resolvePerson('Zed', people, '2').error).toContain('No person')
  })
  it('reads whole zones and single pages', () => {
    expect(resolvePages({ zones: ['data exporter'] }, areas).value?.map((a) => a.id)).toEqual(['a', 'b'])
    expect(resolvePages({ zones: ['my flow', 'landing'] }, areas).value?.map((a) => a.id)).toEqual(['c', 'd', 'e'])
    expect(resolvePages({ pages: ['create'] }, areas).value?.map((a) => a.id)).toEqual(['d'])
    expect(resolvePages({ pages: ['My Flow · APIs'] }, areas).value?.map((a) => a.id)).toEqual(['c'])
    expect(resolvePages({ zones: ['my flow'], pages: ['create'] }, areas).value).toHaveLength(2)
  })
  it('asks rather than guesses', () => {
    expect(resolvePages({ pages: ['APIs'] }, areas).error).toContain('Data Exporter · APIs, My Flow · APIs')
    expect(resolvePages({ zones: ['nope'] }, areas).error).toContain('No zone')
    expect(resolvePages({}, areas).error).toBeTruthy()
  })
})
