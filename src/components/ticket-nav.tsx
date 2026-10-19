'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'

const KEY = 'ticket-nav'
type List = { keys: string[]; from: string }

/** The tickets grid or board records what it shows, in order, so a ticket page can step through it. */
export function rememberTicketList(keys: string[], from: string) {
  try { sessionStorage.setItem(KEY, JSON.stringify({ keys, from } satisfies List)) } catch {}
}

const href = (key: string) => `/tickets/${encodeURIComponent(key)}`

/**
 * Previous / Next on a ticket page, through the list you came from (the grid with its filters and
 * sort, or the board); otherwise through every open ticket, most severe first. [ and ] also work.
 */
export function TicketNav({ current, fallback }: { current: string; fallback: string[] }) {
  const router = useRouter()
  const [list, setList] = useState<List>({ keys: fallback, from: 'open tickets' })
  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(KEY) ?? 'null') as List | null
      if (saved?.keys?.includes(current)) setList(saved)
    } catch {}
  }, [current])
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
  }, [prev, next, router])

  if (i < 0) return null
  return (
    <nav aria-label="Ticket list" className="mb-2 flex items-center justify-end gap-2 text-[12.5px]">
      {prev ? <Link href={href(prev)} className="btn btn-sm" title="Previous ticket ( [ )">‹ Previous</Link> : <span className="btn btn-sm opacity-40">‹ Previous</span>}
      <span className="text-[var(--muted)]">{i + 1} of {list.keys.length} · {list.from}</span>
      {next ? <Link href={href(next)} className="btn btn-sm" title="Next ticket ( ] )">Next ›</Link> : <span className="btn btn-sm opacity-40">Next ›</span>}
    </nav>
  )
}
