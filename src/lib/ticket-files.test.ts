import { describe, expect, it } from 'vitest'
import { MAX_TICKET_ATTACHMENTS, isTicketFilePath, ticketFileFolder, withAttachments } from './ticket-files'

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
