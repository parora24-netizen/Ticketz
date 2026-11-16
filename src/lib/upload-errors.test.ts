import { describe, expect, it } from 'vitest'
import { tooBig, tooMany, uploadErrorMessage } from './upload-errors'

const MB50 = 50 * 1024 * 1024
const TYPES = 'zip, CSV, Excel, JSON, text, PDF or images'

describe('upload errors', () => {
  it('says a file is too big, with the limit, for the messages the storage service sends', () => {
    // The storage service's own answer to a 51 MB upload, seen on the live bucket.
    expect(uploadErrorMessage('data.zip', 'The object exceeded the maximum allowed size', MB50, TYPES)).toBe(tooBig('data.zip', MB50))
    expect(uploadErrorMessage('data.zip', 'Payload too large', MB50, TYPES)).toContain('up to 50 MB')
  })

  it('says a kind of file is not taken, and which are', () => {
    // The live answer to a web page.
    expect(uploadErrorMessage('page.html', 'mime type text/html is not supported', MB50, TYPES)).toBe('page.html is a kind of file that cannot be attached here. Attach zip, CSV, Excel, JSON, text, PDF or images.')
  })

  it('says when the connection dropped, and passes anything else on', () => {
    expect(uploadErrorMessage('a.csv', 'Failed to fetch', MB50, TYPES)).toContain('connection dropped')
    expect(uploadErrorMessage('a.csv', 'new row violates row-level security policy', MB50, TYPES)).toBe('a.csv did not upload: new row violates row-level security policy')
  })

  it('says how many were taken when too many are picked', () => {
    expect(tooMany(12, 10, 10)).toBe('You can attach up to 10 files at a time, so only the first 10 of 12 were added.')
    expect(tooMany(3, 0, 10)).toContain('Remove one')
  })
})
