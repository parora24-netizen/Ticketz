'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Pick one person or several to filter the board by. Empty means everyone; '__none' is the cards
 * nobody has picked up. Each row shows how many open cards are that person's move.
 */
export function PersonFilter({ people, meId, value, onChange, load, everyone }: {
  people: { id: string; name: string }[]
  meId: string
  value: string[]
  onChange: (ids: string[]) => void
  load: Map<string, number>
  everyone: number
}) {
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const away = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc) }
  }, [open])

  const rows = [
    { id: meId, name: 'Me' },
    ...people.filter((p) => p.id !== meId),
    ...(load.has('__none') ? [{ id: '__none', name: 'No owner' }] : []),
  ]
  const nameOf = (id: string) => rows.find((r) => r.id === id)?.name ?? 'Someone'
  const count = value.reduce((n, id) => n + (load.get(id) ?? 0), 0)
  const label = !value.length ? `Everyone · ${everyone} open`
    : value.length <= 2 ? `${value.map(nameOf).join(', ')} · ${count} open`
    : `${value.length} people · ${count} open`
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id])

  return (
    <div ref={box} className="relative -ml-px">
      <button type="button" aria-haspopup="listbox" aria-expanded={open} aria-label="Person" onClick={() => setOpen((o) => !o)}
        className="select min-w-48 text-left">{label}</button>
      {open && (
        <div role="listbox" aria-multiselectable="true" aria-label="People"
          className="absolute top-full left-0 z-30 mt-1 max-h-80 w-64 overflow-y-auto border border-[var(--line)] bg-white py-1 shadow-[0_10px_28px_rgba(9,17,38,.16)]">
          <button type="button" onClick={() => { onChange([]); setOpen(false) }}
            className={`flex w-full items-center justify-between px-3 py-1.5 text-left text-[13px] hover:bg-[var(--surface-3)] ${!value.length ? 'font-semibold' : ''}`}>
            <span>Everyone</span><span className="text-[var(--muted)]">{everyone}</span>
          </button>
          <div className="my-1 border-t border-[var(--line-soft)]" />
          {rows.map((r) => (
            <label key={r.id} role="option" aria-selected={value.includes(r.id)}
              className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-[13px] hover:bg-[var(--surface-3)]">
              <input type="checkbox" checked={value.includes(r.id)} onChange={() => toggle(r.id)} />
              <span className="flex-1">{r.name}</span>
              <span className="text-[var(--muted)]">{load.get(r.id) ?? 0}</span>
            </label>
          ))}
          {value.length > 0 && (
            <div className="mt-1 border-t border-[var(--line-soft)] px-3 pt-1.5 pb-1 text-right">
              <button type="button" onClick={() => setOpen(false)} className="btn btn-sm btn-primary">Done</button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
