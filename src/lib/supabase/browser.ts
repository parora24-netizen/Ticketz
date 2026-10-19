'use client'

import { createBrowserClient } from '@supabase/ssr'
import { publicEnv } from '@/lib/env'

/** The signed-in person's client in the browser; used only to upload result screenshots (RLS applies). */
export function browserClient() {
  return createBrowserClient(publicEnv.supabaseUrl, publicEnv.supabaseKey)
}
