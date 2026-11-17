import { describe, expect, it } from 'vitest'
import { MAX_TICKET_ATTACHMENTS, attachmentAddedBy, isTicketFilePath, ticketFileFolder, withAttachments } from './ticket-files'

const T = '11111111-2222-3333-4444-555555555555'
const OTHER = '99999999-2222-3333-4444-555555555555'
const UP = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'

describe('ticket files', () => {
  it('accepts only files uploaded for this ticket', () => {
    expect(isTicketFilePath(`${ticketFileFolder(T)}/${UP}-error.png`, T)).toBe(true)
    expect(isTicketFilePath(`${ticketFileFolder(OTHER)}/${UP}-error.png`, T)).toBe(false)
    expect(isTicketFilePath(`tickets/${T}/error.png`, T)).toBe(false)
    expect(isTicketFilePath(`runs/${T}/${UP}-error.png`, T)).toBe(false)
  })

  it('adds new files after the old ones, once each, up to the limit', () => {
    expect(withAttachments(['a', 'b'], ['b', 'c'])).toEqual({ paths: ['a', 'b', 'c'] })
    const full = Array.from({ length: MAX_TICKET_ATTACHMENTS }, (_, i) => `f${i}`)
    const r = withAttachments(full, ['new'])
    expect(r.paths).toBe(full)
    expect(r.error).toContain(`up to ${MAX_TICKET_ATTACHMENTS}`)
  })
})

describe('who added a ticket screenshot', () => {
  const p = 'tickets/x/a.png'
  it('is the person whose change put it there, else who raised the ticket', () => {
    const log = [
      { action: 'insert', changes: { attachments: [] }, actor_id: 'raiser' },
      { action: 'update', changes: { severity: ['Low', 'High'] }, actor_id: 'lead' },
      { action: 'update', changes: { attachments: [[], [p]] }, actor_id: 'sara' },
      { action: 'update', changes: { attachments: [[p], [p, 'b']] }, actor_id: 'juan' },
    ]
    expect(attachmentAddedBy(p, log, 'raiser')).toBe('sara')
    expect(attachmentAddedBy('b', log, 'raiser')).toBe('juan')
    expect(attachmentAddedBy(p, [{ action: 'insert', changes: { attachments: [p] }, actor_id: null }], 'raiser')).toBe('raiser')
    expect(attachmentAddedBy(p, [], null)).toBeNull()
  })
})
