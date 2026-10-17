'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { serverEnv } from '@/lib/env'
import { emailDomainAllowed, safeNext } from '@/lib/auth'

export async function sendSignInLink(formData: FormData) {
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const next = safeNext(formData.get('next'))
  const env = serverEnv()
  if (!emailDomainAllowed(email, env.allowedDomains)) {
    redirect(`/login?error=domain&next=${encodeURIComponent(next)}`)
  }
  const origin = (await headers()).get('origin') ?? env.appUrl
  const supabase = await createClient()
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`, shouldCreateUser: true },
  })
  if (error) redirect(`/login?error=send&next=${encodeURIComponent(next)}`)
  redirect(`/login?sent=${encodeURIComponent(email)}`)
}
