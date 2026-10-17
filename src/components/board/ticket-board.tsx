'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { Dialog } from '@/components/dialog'
import { toast } from '@/components/toast'
import { STATE_LABEL, canMove, requiredFor, type Role, type TicketState } from '@/lib/workflow/ticket-machine'
import { moveTicketFromBoard } from '@/app/(app)/actions'

export type BoardTicket = {
  id: string
  key: string
  title: string
  severity: 'Critical' | 'High' | 'Medium' | 'Low'
  state: TicketState
  owner_id: string | null
  owner_name: string | null
  tc_id: string | null
  zone: string | null
  page: string | null
  updated_at: string
}

const COLUMNS: TicketState[] = ['new', 'triaged', 'in_fix', 'ready_for_retest', 'reopened', 'closed']
const SEVERITIES = ['Critical', 'High', 'Medium', 'Low'] as const
type Lane = 'none' | 'owner' | 'severity'

const INPUT_LABEL = {
  fixed_in_build: { title: 'Which build has the fix?', placeholder: 'e.g. b39a5eab1' },
  defer_reason: { title: 'Why can this wait past 26.111?', placeholder: 'Reason' },
  duplicate_of: { title: 'Which ticket does this duplicate?', placeholder: 'e.g. DEV-TC_FN_070' },
} as const

const ROLE_NAME: Record<Role, string> = { lead: 'lead', dev: 'dev', qa: 'QA' }

/** Jira-style board: drag a ticket to a column; only the moves your role may make accept the drop. */
export function TicketBoard({ tickets, role, meId, zones }: { tickets: BoardTicket[]; role: Role; meId: string; zones: string[] }) {
  const [local, setLocal] = useState<Record<string, TicketState>>({})
  const [dragging, setDragging] = useState<BoardTicket | null>(null)
  const [pending, setPending] = useState<{ t: BoardTicket; to: TicketState } | null>(null)
  const [input, setInput] = useState('')
  const setMsg = (m: { tone: 'ok' | 'error'; text: string }) => toast(m.text, m.tone)
  const [owner, setOwner] = useState('') // '' everyone, '__none' nobody, else a person id
  const [high, setHigh] = useState(false)
  const [zone, setZone] = useState('')
  const [lane, setLane] = useState<Lane>('none')
  const [q, setQ] = useState('')

  useEffect(() => setLocal({}), [tickets])

  const stateOf = (t: BoardTicket) => local[t.id] ?? t.state
  const visible = useMemo(
    () => tickets.filter((t) => (!owner || (owner === '__none' ? !t.owner_id : t.owner_id === owner)) && (!high || t.severity === 'Critical' || t.severity === 'High') && (!zone || t.zone === zone)
      && (!q || `${t.key} ${t.title} ${t.tc_id ?? ''}`.toLowerCase().includes(q.toLowerCase()))),
    [tickets, owner, high, zone, q],
  )
  // Open tickets per owner, for the owner filter and the ‹ › walk at standup.
  const load = useMemo(() => {
    const m = new Map<string, { name: string; n: number }>()
    for (const t of tickets) {
      if (['closed', 'deferred', 'duplicate'].includes(t.state)) continue
      const id = t.owner_id ?? '__none'
      const e = m.get(id) ?? { name: t.owner_name ?? 'No owner', n: 0 }
      e.n++
      m.set(id, e)
    }
    return m
  }, [tickets])
  const walk = [...load.entries()].filter(([id]) => id !== '__none').sort((a, b) => a[1].name.localeCompare(b[1].name))
  function step(d: 1 | -1) {
    if (!walk.length) return
    const i = walk.findIndex(([id]) => id === owner)
    setOwner(walk[(i + d + walk.length) % walk.length][0])
  }
  const parked = visible.filter((t) => ['deferred', 'duplicate'].includes(stateOf(t))).length

  async function move(t: BoardTicket, to: TicketState, extra: Record<string, string> = {}) {
    const from = stateOf(t)
    setLocal((l) => ({ ...l, [t.id]: to }))
    const res = await moveTicketFromBoard({ ticket_id: t.id, to, ...extra } as Parameters<typeof moveTicketFromBoard>[0])
    if (res.error) {
      setLocal((l) => ({ ...l, [t.id]: from }))
      setMsg({ tone: 'error', text: `${t.key}: ${res.error}` })
    } else setMsg({ tone: 'ok', text: `${t.key} moved to ${STATE_LABEL[to]}` })
  }

  function drop(to: TicketState) {
    const t = dragging
    setDragging(null)
    if (!t || stateOf(t) === to) return
    if (!canMove(stateOf(t), to, role)) {
      setMsg({ tone: 'error', text: `As ${ROLE_NAME[role]}, you cannot move ${t.key} from ${STATE_LABEL[stateOf(t)]} to ${STATE_LABEL[to]}` })
      return
    }
    if (requiredFor(to)) {
      setInput('')
      setPending({ t, to })
      return
    }
    void move(t, to)
  }

  const lanes: { key: string; label: string; items: BoardTicket[] }[] =
    lane === 'owner'
      ? [...new Set(visible.map((t) => t.owner_name ?? 'Unassigned'))]
          .sort((a, b) => (a === 'Unassigned' ? -1 : b === 'Unassigned' ? 1 : a.localeCompare(b)))
          .map((name) => ({ key: name, label: name, items: visible.filter((t) => (t.owner_name ?? 'Unassigned') === name) }))
      : lane === 'severity'
        ? SEVERITIES.map((s) => ({ key: s, label: s, items: visible.filter((t) => t.severity === s) })).filter((l) => l.items.length)
        : [{ key: 'all', label: '', items: visible }]

  const need = pending ? requiredFor(pending.to) : null
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tickets" aria-label="Search tickets" className="input w-56" />
        <div className="flex items-center">
          <button type="button" onClick={() => step(-1)} aria-label="Previous person" className="btn px-2">‹</button>
          <select value={owner} onChange={(e) => setOwner(e.target.value)} aria-label="Owner" className="select -ml-px min-w-44">
            <option value="">Everyone</option>
            {load.has(meId) && <option value={meId}>Me · {load.get(meId)!.n} open</option>}
            {walk.filter(([id]) => id !== meId).map(([id, e]) => <option key={id} value={id}>{e.name} · {e.n} open</option>)}
            {load.has('__none') && <option value="__none">No owner · {load.get('__none')!.n} open</option>}
          </select>
          <button type="button" onClick={() => step(1)} aria-label="Next person" className="btn -ml-px px-2">›</button>
        </div>
        <button type="button" onClick={() => setHigh((v) => !v)} className={`btn ${high ? 'btn-primary' : ''}`}>Critical &amp; High</button>
        <select value={zone} onChange={(e) => setZone(e.target.value)} className="select" aria-label="Zone">
          <option value="">All zones</option>
          {zones.map((z) => <option key={z}>{z}</option>)}
        </select>
        <label className="ml-2 flex items-center gap-2 text-[12.5px] text-[var(--muted)]">
          Group by
          <select value={lane} onChange={(e) => setLane(e.target.value as Lane)} className="select">
            <option value="none">Nothing</option>
            <option value="owner">Owner</option>
            <option value="severity">Severity</option>
          </select>
        </label>
        {parked > 0 && <Link href="/tickets?view=grid" className="ml-auto text-[12.5px] text-[var(--accent)] hover:underline">{parked} deferred or duplicate</Link>}
      </div>

      <div className="overflow-x-auto pb-2">
        <div className="min-w-[1100px] space-y-4">
          {lanes.map((ln, li) => (
            <section key={ln.key}>
              {ln.label && <h3 className="label mb-1.5">{ln.label} · {ln.items.filter((t) => COLUMNS.includes(stateOf(t))).length}</h3>}
              <div className="grid grid-cols-6 gap-2">
                {COLUMNS.map((col) => {
                  const cards = ln.items
                    .filter((t) => stateOf(t) === col)
                    .sort((a, b) => SEVERITIES.indexOf(a.severity) - SEVERITIES.indexOf(b.severity) || b.updated_at.localeCompare(a.updated_at))
                  const shown = col === 'closed' ? cards.slice(0, 20) : cards
                  const droppable = !!dragging && stateOf(dragging) !== col && canMove(stateOf(dragging), col, role)
                  return (
                    <div key={col}
                      onDragOver={(e) => { if (droppable) e.preventDefault() }}
                      onDrop={(e) => { e.preventDefault(); drop(col) }}
                      className={`flex min-h-24 flex-col border bg-[var(--surface-2)] p-1.5 transition-colors ${
                        droppable ? 'border-dashed border-[var(--navy)] bg-[var(--accent-soft)]' : dragging ? 'border-transparent opacity-60' : 'border-transparent'}`}>
                      {li === 0 && (
                        <div className="flex items-baseline justify-between px-1 pb-1.5">
                          <span className="text-[12px] font-semibold text-[var(--navy-ink)]">{STATE_LABEL[col]}</span>
                          <span className="mono text-[11px] text-[var(--faint)]">{visible.filter((t) => stateOf(t) === col).length}</span>
                        </div>
                      )}
                      <div className="max-h-[calc(100vh-250px)] min-h-16 space-y-1.5 overflow-y-auto">
                        {shown.map((t) => (
                          <article key={t.id} draggable
                            onDragStart={(e) => { setDragging(t); e.dataTransfer.effectAllowed = 'move' }}
                            onDragEnd={() => setDragging(null)}
                            className={`cursor-grab border border-[var(--line)] bg-white p-2 active:cursor-grabbing ${
                              t.severity === 'Critical' ? 'shadow-[inset_3px_0_0_var(--crit)]' : t.severity === 'High' ? 'shadow-[inset_3px_0_0_var(--warn)]' : ''}`}>
                            <Link href={`/tickets/${encodeURIComponent(t.key)}`} draggable={false}
                              className="mono block truncate text-[11px] font-medium text-[var(--accent)] hover:underline" title={t.key}>{t.key}</Link>
                            <p className="mt-1 line-clamp-2 text-[12.5px] leading-snug text-[var(--ink)]">{t.title}</p>
                            <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-[var(--faint)]">
                              <span className={`font-semibold ${t.severity === 'Critical' ? 'text-[var(--crit)]' : t.severity === 'High' ? 'text-[var(--warn)]' : 'text-[var(--muted)]'}`}>{t.severity}</span>
                              <span>·</span>
                              <span className="min-w-0 flex-1 truncate">{t.page ?? ''}</span>
                              {t.owner_name
                                ? <span title={t.owner_name} className="flex h-5 min-w-5 items-center justify-center bg-[#2b57c4] px-1 text-[10px] font-semibold text-white">{t.owner_name.slice(0, 2).toUpperCase()}</span>
                                : <span className="text-[var(--faint)]">Unassigned</span>}
                            </div>
                          </article>
                        ))}
                        {cards.length > shown.length && <p className="px-1 text-[11px] text-[var(--faint)]">+{cards.length - shown.length} older</p>}
                      </div>
                    </div>
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      </div>

      <Dialog open={!!pending} onClose={() => setPending(null)} title={need ? INPUT_LABEL[need].title : ''}>
        {pending && need && (
          <form
            onSubmit={(e) => {
              e.preventDefault()
              const key = need === 'duplicate_of' ? 'duplicate_key' : need
              void move(pending.t, pending.to, { [key]: input.trim() })
              setPending(null)
            }}>
            <p className="mb-2 text-[12.5px] text-[var(--muted)]">{pending.t.key} → {STATE_LABEL[pending.to]}</p>
            <input autoFocus required value={input} onChange={(e) => setInput(e.target.value)} placeholder={INPUT_LABEL[need].placeholder} className="input w-full" />
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" onClick={() => setPending(null)} className="btn">Cancel</button>
              <button className="btn btn-primary">Move ticket</button>
            </div>
          </form>
        )}
      </Dialog>
    </div>
  )
}
