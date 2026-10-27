'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import { browserClient } from '@/lib/supabase/browser'
import { STATE_LABEL, type TicketState } from '@/lib/workflow/ticket-machine'

type Note = {
  id: number; kind: 'assigned' | 'mention' | 'comment' | 'state'; detail: string | null; created_at: string; read_at: string | null
  tickets: { key: string; title: string } | null; actor: { name: string } | null
}

const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v)
const ago = (iso: string) => {
  const m = Math.round((Date.now() - Date.parse(iso)) / 60_000)
  if (m < 1) return 'now'
  if (m < 60) return `${m} m`
  if (m < 1440) return `${Math.round(m / 60)} h`
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })
}
function what(n: Note): string {
  switch (n.kind) {
    case 'assigned': return 'assigned you'
    case 'mention': return 'mentioned you on'
    case 'comment': return 'commented on'
    case 'state': {
      const [from, to] = (n.detail ?? '').split(' → ')
      return `moved ${STATE_LABEL[from as TicketState] ?? from} → ${STATE_LABEL[to as TicketState] ?? to}:`
    }
  }
}

/**
 * The bell in the top bar: tickets assigned to you, @mentions, comments on your tickets and moves
 * of tickets you own or raised. Checked on each page change and once a minute.
 */
export function NotificationBell() {
  const path = usePathname()
  const [notes, setNotes] = useState<Note[]>([])
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const unread = notes.filter((n) => !n.read_at).length

  const load = useCallback(async () => {
    const { data } = await browserClient().from('notifications')
      .select('id, kind, detail, created_at, read_at, tickets(key, title), actor:people!notifications_actor_id_fkey(name)')
      .order('created_at', { ascending: false }).limit(30)
    if (data) setNotes(data.map((n) => ({ ...n, tickets: one(n.tickets), actor: one(n.actor) })) as Note[])
  }, [])
  useEffect(() => { void load() }, [load, path])
  useEffect(() => {
    const t = window.setInterval(() => { if (document.visibilityState === 'visible') void load() }, 60_000)
    return () => window.clearInterval(t)
  }, [load])
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc) }
  }, [open])

  async function markRead(ids: number[]) {
    if (!ids.length) return
    const now = new Date().toISOString()
    setNotes((ns) => ns.map((n) => (ids.includes(n.id) ? { ...n, read_at: now } : n)))
    await browserClient().from('notifications').update({ read_at: now }).in('id', ids)
  }

  return (
    <div ref={box} className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
        aria-label={unread ? `Notifications, ${unread} unread` : 'Notifications'}
        className="relative flex h-8 w-8 items-center justify-center rounded-full text-[var(--ink-2)] hover:bg-[var(--surface-2)]">
        <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          <path d="M6 10a6 6 0 1 1 12 0c0 4 1.5 5.5 2 6H4c.5-.5 2-2 2-6Z" strokeLinejoin="round" />
          <path d="M10 19a2 2 0 0 0 4 0" strokeLinecap="round" />
        </svg>
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--crit)] px-1 text-[10px] leading-none font-semibold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 z-40 mt-2 w-[22rem] max-w-[calc(100vw-2rem)] border border-[var(--line)] bg-white shadow-[0_18px_44px_rgba(9,17,38,.24)]">
          <div className="flex items-center justify-between border-b border-[var(--line)] px-3 py-2">
            <b className="text-[13px] text-[var(--navy-ink)]">Notifications</b>
            {unread > 0 && <button type="button" onClick={() => void markRead(notes.filter((n) => !n.read_at).map((n) => n.id))} className="text-[12px] text-[var(--accent)] hover:underline">Mark all read</button>}
          </div>
          <ul className="max-h-[60vh] divide-y divide-[var(--line-soft)] overflow-y-auto">
            {notes.map((n) => (
              <li key={n.id}>
                <Link href={n.tickets ? `/tickets/${encodeURIComponent(n.tickets.key)}` : '#'} onClick={() => { void markRead([n.id]); setOpen(false) }}
                  className={`block px-3 py-2 text-[12.5px] hover:bg-[var(--surface-3)] ${n.read_at ? 'text-[var(--muted)]' : 'bg-[var(--accent-soft)]/40 text-[var(--ink-2)]'}`}>
                  <div className="flex items-baseline gap-2">
                    {!n.read_at && <span aria-label="unread" className="h-2 w-2 shrink-0 rounded-full bg-[var(--accent)]" />}
                    <span className="min-w-0 flex-1">
                      <b className="font-semibold text-[var(--ink)]">{n.actor?.name ?? 'Someone'}</b> {what(n)}{' '}
                      <span className="mono text-[11.5px] text-[var(--accent)]">{n.tickets?.key}</span>
                    </span>
                    <span className="shrink-0 text-[11px] text-[var(--faint)]">{ago(n.created_at)}</span>
                  </div>
                  {(n.kind === 'mention' || n.kind === 'comment' || n.kind === 'assigned') && (n.kind === 'assigned' ? n.tickets?.title : n.detail) && (
                    <p className="mt-0.5 line-clamp-2 pl-4 text-[12px] text-[var(--muted)]">{n.kind === 'assigned' ? n.tickets?.title : n.detail}</p>
                  )}
                </Link>
              </li>
            ))}
            {!notes.length && <li className="px-3 py-6 text-center text-[12.5px] text-[var(--muted)]">Nothing yet. You&apos;ll see tickets assigned to you, @mentions and moves on your tickets here.</li>}
          </ul>
        </div>
      )}
    </div>
  )
}
