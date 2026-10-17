import 'server-only'
import { createServerClient } from '@supabase/ssr'
import { createClient as createPlainClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { publicEnv, serverEnv } from '@/lib/env'

/** Carries the signed-in person's session; every query is subject to RLS. Use this by default. */
export async function createClient() {
  const cookieStore = await cookies()
  return createServerClient(publicEnv.supabaseUrl, publicEnv.supabaseKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll(toSet) {
        try {
          toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        } catch {
          // Called from a Server Component; the proxy refreshes the session instead.
        }
      },
    },
  })
}

/**
 * Secret-key client. Bypasses RLS. Only for the CI results API, which authenticates
 * with its own token. Never use it to render a page.
 */
export function createServiceClient() {
  return createPlainClient(publicEnv.supabaseUrl, serverEnv().secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
