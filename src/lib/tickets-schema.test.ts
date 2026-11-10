import { describe, expect, it } from 'vitest'
import { BulkChange, CREATE_FIELDS, TicketChange, TicketCreate, issuesOf, needsAssign, splitArea } from './tickets-schema'

describe('the tickets API payloads', () => {
  it('takes a ticket filled in completely, and refuses what it does not know by name', () => {
    expect(TicketCreate.safeParse({ kind: 'task', title: 'Publish #1 – Reorder the top nav', owner: 'Sara', accountable: 'Juan', area: 'Logic Builder · Objects', external_ref: 'Publish #1', depends_on: ['dev-384'] }).success).toBe(true)
    const bad = TicketCreate.safeParse({ title: 'Something broke', assignee: 'Sara' })
    expect(bad.success).toBe(false)
    if (!bad.success) expect(issuesOf(bad.error, CREATE_FIELDS)).toMatchObject({ error: 'Not accepted: assignee', accepted: expect.arrayContaining(['owner', 'accountable', 'area']) })
    expect(TicketCreate.safeParse({ kind: 'test_mismatch', title: 'No case' }).success).toBe(false)
    expect(TicketCreate.parse({ title: 'x y z', depends_on: ['dev-1'] }).depends_on).toEqual(['DEV-1'])
  })
  it('changes one field or many, and knows when it is only an assignment', () => {
    expect(TicketChange.safeParse({}).success).toBe(false)
    expect(TicketChange.safeParse({ state: 'in_fix', owner: null }).success).toBe(true)
    expect(needsAssign({ owner: 'Sara' })).toBe(true)
    expect(BulkChange.safeParse({ keys: ['DEV-385', 'DEV-386'], set: { owner: 'Sara' } }).success).toBe(true)
    expect(BulkChange.safeParse({ tickets: [{ key: 'DEV-385', state: 'in_fix' }] }).success).toBe(true)
  })
  it('reads a page however it is written', () => {
    expect(splitArea('Logic Builder · Objects')).toEqual({ zone: 'Logic Builder', page: 'Objects' })
    expect(splitArea('Logic Builder / Objects')).toEqual({ zone: 'Logic Builder', page: 'Objects' })
    expect(splitArea('Objects')).toBeNull()
  })
})
