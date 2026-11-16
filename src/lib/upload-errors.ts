/** Plain words for why a file did not upload, in place of the storage service's own messages. */

export const megabytes = (bytes: number) => `${Math.round(bytes / 1024 / 1024)} MB`

export function tooBig(name: string, maxBytes: number) {
  return `${name} is too big to attach. Files can be up to ${megabytes(maxBytes)}; split or compress it, or share a smaller sample.`
}

/** What a storage rejection means for the person: the file's size, its type, or something else. */
export function uploadErrorMessage(name: string, message: string, maxBytes: number, types: string) {
  if (/maximum allowed size|too large|EntityTooLarge|\b413\b/i.test(message)) return tooBig(name, maxBytes)
  if (/mime type|not supported|InvalidMimeType|\b415\b/i.test(message)) return `${name} is a kind of file that cannot be attached here. Attach ${types}.`
  if (/fetch|network|timeout/i.test(message)) return `${name} did not upload: the connection dropped. Try again.`
  return `${name} did not upload: ${message}`
}

/** When more files are picked than are taken at once. */
export function tooMany(picked: number, room: number, maxFiles: number) {
  if (room <= 0) return `You can attach up to ${maxFiles} files at a time. Remove one or save these first.`
  return `You can attach up to ${maxFiles} files at a time, so only the first ${room} of ${picked} were added.`
}
