'use client'

import { useEffect } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { toast } from './toast'

/**
 * Forms that post to the server come back with ?ok= or ?error=. This hands the message to the
 * shared toast and clears it from the URL, so a reload doesn't show it again.
 */
export function Flash({ error, ok }: { error?: string; ok?: string }) {
  const router = useRouter()
  const path = usePathname()
  const params = useSearchParams()
  useEffect(() => {
    if (!error && !ok) return
    toast(error ?? ok!, error ? 'error' : 'ok')
    const next = new URLSearchParams(params.toString())
    next.delete('ok')
    next.delete('error')
    const q = next.toString()
    router.replace(q ? `${path}?${q}` : path, { scroll: false })
  }, [error, ok]) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}
