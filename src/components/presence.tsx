'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useRef } from 'react'
import { browserClient } from '@/lib/supabase/browser'

const EVERY_MS = 60_000
const MIN_GAP_MS = 15_000

/**
 * Tells the lead's Activity screen that this person is using the app: a ping on each page
 * change and once a minute, only while the tab is visible. Failures are ignored.
 */
export function Presence() {
  const path = usePathname()
  const last = useRef(0)
  const current = useRef(path)
  current.current = path

  useEffect(() => {
    const ping = () => {
      if (document.visibilityState !== 'visible' || Date.now() - last.current < MIN_GAP_MS) return
      last.current = Date.now()
      void browserClient().from('presence_pings').insert({ path: current.current.slice(0, 300) }).then(() => {}, () => {})
    }
    ping()
    const timer = window.setInterval(ping, EVERY_MS)
    document.addEventListener('visibilitychange', ping)
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', ping) }
  }, [path])
  return null
}
