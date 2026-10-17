'use client'

import { useEffect, useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'

/**
 * Confirms a save or explains a failure. Actions redirect back with ?ok= or ?error=; this shows
 * the message as a toast where it can't be missed, then clears it from the URL.
 */
export function Flash({ error, ok }: { error?: string; ok?: string }) {
  const router = useRouter()
  const path = usePathname()
  const params = useSearchParams()
  const [shown, setShown] = useState<{ error?: string; ok?: string } | null>(error || ok ? { error, ok } : null)

  useEffect(() => {
    if (!error && !ok) return
    setShown({ error, ok })
    const next = new URLSearchParams(params.toString())
    next.delete('ok')
    next.delete('error')
    const q = next.toString()
    router.replace(q ? `${path}?${q}` : path, { scroll: false })
    if (ok) {
      const t = setTimeout(() => setShown(null), 3500)
      return () => clearTimeout(t)
    }
  }, [error, ok]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!shown) return null
  const isError = !!shown.error
  return (
    <div role={isError ? 'alert' : 'status'}
      className={`toast-in fixed right-4 bottom-4 z-50 flex max-w-sm items-start gap-3 border px-4 py-3 text-[13px] shadow-[0_18px_44px_rgba(9,17,38,.24)] ${
        isError ? 'border-[var(--crit-line)] bg-[var(--crit-soft)] text-[var(--crit)]' : 'border-[var(--navy-ink)] bg-[var(--navy-ink)] text-white'
      }`}>
      <span aria-hidden className="font-semibold">{isError ? '!' : '✓'}</span>
      <span className="flex-1">{shown.error ?? shown.ok}</span>
      <button onClick={() => setShown(null)} className="opacity-70 hover:opacity-100" aria-label="Dismiss">✕</button>
    </div>
  )
}
