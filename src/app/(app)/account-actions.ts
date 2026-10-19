'use server'

import { randomInt } from 'node:crypto'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { getMe } from '@/lib/auth'
import { createClient, createServiceClient } from '@/lib/supabase/server'

// No 0/O, 1/l/I: the lead reads this out or pastes it into chat.
const ALPHABET = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789'
const tempPassword = () =>
  [0, 1, 2].map(() => Array.from({ length: 4 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('')).join('-')

/**
 * The lead gives someone a temporary password, so signing in never waits on an email (the
 * built-in sender allows only a few per hour). Creates the sign-in if the person has none yet.
 * The password is returned once, to the lead's screen, and not stored anywhere else.
 */
export async function setTempPassword(personId: string): Promise<{ error?: string; password?: string; email?: string }> {
  const me = await getMe()
  if (me.role !== 'lead') return { error: 'Only the lead gives out passwords' }
  if (!z.uuid().safeParse(personId).success) return { error: 'Pick a person' }
  const supabase = await createClient()
  const { data: person } = await supabase.from('people').select('email, active').eq('id', personId).single()
  if (!person?.email) return { error: 'Add their email on the Team grid first' }
  if (!person.active) return { error: 'Turn their access on first' }
  const email = person.email.toLowerCase()

  const admin = createServiceClient()
  const { data: list, error: listError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (listError) return { error: listError.message }
  const existing = list.users.find((u) => u.email?.toLowerCase() === email)
  const password = tempPassword()
  // The flag sends them to /set-password on their first sign-in, until they choose their own.
  const { error } = existing
    ? await admin.auth.admin.updateUserById(existing.id, { password, email_confirm: true, user_metadata: { ...existing.user_metadata, must_change_password: true } })
    : await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { must_change_password: true } })
  if (error) return { error: error.message }
  return { password, email }
}

/**
 * Anyone signed in changes their own password; no email needed. Also clears the temporary-password
 * flag, and refreshes the session so the next page sees it cleared. Not behind getMe(), which
 * would send someone with a temporary password straight back to /set-password.
 */
export async function changePassword(password: string, confirm: string): Promise<{ error?: string }> {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getClaims()
  if (!auth?.claims?.email) return { error: 'Sign in again' }
  if (password.length < 8) return { error: 'Use at least 8 characters' }
  if (password !== confirm) return { error: 'The two passwords do not match' }
  const { error } = await supabase.auth.updateUser({ password, data: { must_change_password: false } })
  if (error) return { error: /weak|password|same/i.test(error.message) ? 'Choose a different, stronger password' : error.message }
  await supabase.auth.refreshSession()
  return {}
}

/** The /set-password form: save, then into the app. */
export async function finishTempPassword(formData: FormData): Promise<{ error?: string }> {
  const res = await changePassword(String(formData.get('password') ?? ''), String(formData.get('confirm') ?? ''))
  if (res.error) return res
  redirect('/')
}
