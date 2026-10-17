import 'server-only'
import { cache } from 'react'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import type { Role } from '@/lib/workflow/ticket-machine'

export type Me = { id: string; name: string; email: string; role: Role }

/** The signed-in team member. Signed-in people who are not on the team go to /no-access. */
export const getMe = cache(async (): Promise<Me> => {
  const supabase = await createClient()
  // Verified locally from the session token; the database applies the same identity through RLS.
  const { data: auth } = await supabase.auth.getClaims()
  const email = typeof auth?.claims?.email === 'string' ? auth.claims.email : null
  if (!email) redirect('/login')
  const { data } = await supabase
    .from('people')
    .select('id, name, email, role')
    .ilike('email', email)
    .eq('active', true)
    .maybeSingle()
  if (!data) redirect('/no-access')
  return data as Me
})

/** Only ever redirect inside this app: `next` comes from the query string. */
export function safeNext(raw: unknown): string {
  const value = String(raw ?? '/')
  return value.startsWith('/') && !value.startsWith('//') ? value : '/'
}

export function emailDomainAllowed(email: string, domains: string[]): boolean {
  const at = email.lastIndexOf('@')
  if (at < 1) return false
  return domains.includes(email.slice(at + 1).trim().toLowerCase())
}
