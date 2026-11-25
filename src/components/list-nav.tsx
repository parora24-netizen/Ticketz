'use client'

import Link from '@/components/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

type List = { keys: string[]; from: string }

/** A list page records what it shows, in order, so its detail pages can step through it. */
export function rememberList(name: string, keys: string[], from: string) {
  try { sessionStorage.setItem(`list-nav:${name}`, JSON.stringify({ keys, from } satisfies List)) } catch {}
}

/**
 * Previous / Next on a detail page, through the list you came from (with its filters and sort);
 * otherwise through `fallback`. [ and ] also work.
 */
export function ListNav({ name, current, fallback, fallbackFrom, base, noun }: {
  name: string; current: string; fallback: string[]; fallbackFrom: string; base: string; noun: string
}) {
  const router = useRouter()
  const href = (key: string) => `${base}/${encodeURIComponent(key)}`
  const [list, setList] = useState<List>({ keys: fallback, from: fallbackFrom })
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(`list-nav:${name}`) ?? 'null') as List | null
      if (saved?.keys?.includes(current)) setList(saved)
    } catch {}
  }, [current, name])
  const i = list.keys.indexOf(current)
  const prev = i > 0 ? list.keys[i - 1] : null
  const next = i >= 0 && i < list.keys.length - 1 ? list.keys[i + 1] : null

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select, dialog, [contenteditable]')) return
      if (e.key === '[' && prev) router.push(href(prev))
      if (e.key === ']' && next) router.push(href(next))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (i < 0) return null
  return (
    <nav aria-label={`${noun} list`} className="mb-2 flex items-center justify-end gap-2 text-[12.5px]">
      {prev ? <Link href={href(prev)} className="btn btn-sm" title={`Previous ${noun} ( [ )`}>‹ Previous</Link> : <span className="btn btn-sm opacity-40">‹ Previous</span>}
      <span className="text-[var(--muted)]">{i + 1} of {list.keys.length} · {list.from}</span>
      {next ? <Link href={href(next)} className="btn btn-sm" title={`Next ${noun} ( ] )`}>Next ›</Link> : <span className="btn btn-sm opacity-40">Next ›</span>}
    </nav>
  )
}
