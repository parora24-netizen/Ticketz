'use client'

import { useEffect, useState } from 'react'

type Toast = { id: number; text: string; tone: 'ok' | 'error' }
const EVENT = 'app-toast'
let seq = 0

/** Show a confirmation or an error in the one toast stack every screen shares. */
export function toast(text: string, tone: 'ok' | 'error' = 'ok') {
  window.dispatchEvent(new CustomEvent<Toast>(EVENT, { detail: { id: ++seq, text, tone } }))
}

/** Mounted once in the app shell. Confirmations fade after a few seconds; errors stay until dismissed. */
export function Toaster() {
  const [items, setItems] = useState<Toast[]>([])
  useEffect(() => {
    const on = (e: Event) => {
      const t = (e as CustomEvent<Toast>).detail
      setItems((xs) => [...xs.slice(-3), t])
      if (t.tone === 'ok') setTimeout(() => setItems((xs) => xs.filter((x) => x.id !== t.id)), 3500)
    }
    window.addEventListener(EVENT, on)
    return () => window.removeEventListener(EVENT, on)
  }, [])
  return (
    <div className="pointer-events-none fixed right-4 bottom-20 z-50 flex w-[min(380px,calc(100vw-32px))] flex-col gap-2 md:bottom-4">
      {items.map((t) => (
        <div key={t.id} role={t.tone === 'error' ? 'alert' : 'status'}
          className={`toast-in pointer-events-auto flex items-start gap-3 border px-4 py-3 text-[13px] shadow-[0_18px_44px_rgba(9,17,38,.24)] ${
            t.tone === 'error' ? 'border-[var(--crit-line)] bg-[var(--crit-soft)] text-[var(--crit)]' : 'border-[var(--navy-ink)] bg-[var(--navy-ink)] text-white'}`}>
          <span aria-hidden className="font-semibold">{t.tone === 'error' ? '!' : '✓'}</span>
          <span className="flex-1">{t.text}</span>
          <button type="button" onClick={() => setItems((xs) => xs.filter((x) => x.id !== t.id))} className="opacity-70 hover:opacity-100" aria-label="Dismiss">✕</button>
        </div>
      ))}
    </div>
  )
}
