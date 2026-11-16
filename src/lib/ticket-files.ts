/**
 * Screenshots and PDFs added to a ticket after it was raised. They go in the private evidence
 * bucket under tickets/<ticket id>/, beside those raised with it, and the ticket lists their paths.
 */

export const MAX_TICKET_ATTACHMENTS = 30
export const ticketFileFolder = (ticketId: string) => `tickets/${ticketId}`

const PATH = /^tickets\/([0-9a-f-]{36})\/[0-9a-f-]{36}-[\w.-]{1,120}$/

/** True when `path` is a file uploaded for this ticket, as the uploader names it. */
export function isTicketFilePath(path: string, ticketId: string) {
  const m = PATH.exec(path)
  return !!m && m[1] === ticketId
}

/** The ticket's files with the new ones after them, without repeats, up to the limit. */
export function withAttachments(current: string[], added: string[]): { paths: string[]; error?: string } {
  const paths = [...new Set([...current, ...added])]
  if (paths.length > MAX_TICKET_ATTACHMENTS) return { paths: current, error: `A ticket can hold up to ${MAX_TICKET_ATTACHMENTS} screenshots or PDFs; it has ${current.length}.` }
  return { paths }
}
