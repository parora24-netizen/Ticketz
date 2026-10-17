'use server'

import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { serverEnv } from '@/lib/env'
import { emailDomainAllowed, safeNext } from '@/lib/auth'

const q = (params: Record<string, string | undefined>) =>
  '?' + new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]).toString()

/** Day-to-day sign-in. */
export async function signInWithPassword(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const password = String(formData.get('password') ?? '')
  const next = safeNext(formData.get('next'))
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  // The email goes back so the form can refill it. Never the password.
  if (error) redirect(`/login${q({ error: 'credentials', email, next })}`)
  redirect(next)
}

/** First time, or forgot the password: email a one-time code. */
export async function sendCode(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const next = safeNext(formData.get('next'))
  if (!emailDomainAllowed(email, serverEnv().allowedDomains)) redirect(`/login${q({ mode: 'code', error: 'domain', next })}`)
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: true } })
  if (error) {
    const limited = /rate|limit|seconds/i.test(error.message)
    redirect(`/login${q({ mode: 'code', error: limited ? 'rate' : 'send', email, next })}`)
  }
  redirect(`/login${q({ mode: 'code', sent: email, next })}`)
}

/** Check the code, then save the new password and sign in. */
export async function setPasswordWithCode(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const token = String(formData.get('code') ?? '').replace(/\s+/g, '')
  const password = String(formData.get('password') ?? '')
  const next = safeNext(formData.get('next'))
  const back = (error: string) => redirect(`/login${q({ mode: 'code', sent: email, error, next })}`)
  if (password.length < 8) back('short')
  if (password !== String(formData.get('confirm') ?? '')) back('mismatch')
  const supabase = await createClient()
  const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' })
  if (error) back('code')
  const { error: pwError } = await supabase.auth.updateUser({ password })
  if (pwError) back(/weak|password/i.test(pwError.message) ? 'weak' : 'save')
  redirect(next)
}
