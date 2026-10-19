import 'server-only'
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { serverEnv } from '@/lib/env'

// A key for one purpose, derived from the server's secret; never stored.
const key = (purpose: string) => createHash('sha256').update(`${serverEnv().secretKey}:${purpose}`).digest()

/** Encrypt a short secret for storage (AES-256-GCM): iv, tag and ciphertext, base64url. */
export function seal(plain: string, purpose: string): string {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', key(purpose), iv)
  const body = Buffer.concat([c.update(plain, 'utf8'), c.final()])
  return Buffer.concat([iv, c.getAuthTag(), body]).toString('base64url')
}

export function open(sealed: string, purpose: string): string {
  const raw = Buffer.from(sealed, 'base64url')
  const d = createDecipheriv('aes-256-gcm', key(purpose), raw.subarray(0, 12))
  d.setAuthTag(raw.subarray(12, 28))
  return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8')
}
