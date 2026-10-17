'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { Dialog } from '@/components/dialog'
import { toast } from '@/components/toast'
import { PriorityChip } from '@/components/ui'
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
  const [mine, setMine] = useState(false)
  const [high, setHigh] = useState(false)
  const [zone, setZone] = useState('')
  const [lane, setLane] = useState<Lane>('none')

  useEffect(() => setLocal({}), [tickets])

  const stateOf = (t: BoardTicket) => local[t.id] ?? t.state
  const visible = useMemo(
    () => tickets.filter((t) => (!mine || t.owner_id === meId) && (!high || t.severity === 'Critical' || t.severity === 'High') && (!zone || t.zone === zone)),
    [tickets, mine, high, zone, meId],
  )
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
        <button type="button" onClick={() => setMine((v) => !v)} className={`btn ${mine ? 'btn-primary' : ''}`}>Only mine</button>
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
                      <div className="space-y-1.5">
                        {shown.map((t) => (
                          <article key={t.id} draggable
                            onDragStart={(e) => { setDragging(t); e.dataTransfer.effectAllowed = 'move' }}
                            onDragEnd={() => setDragging(null)}
                            className={`cursor-grab border border-[var(--line)] bg-white p-2 active:cursor-grabbing ${
                              t.severity === 'Critical' ? 'shadow-[inset_3px_0_0_var(--crit)]' : t.severity === 'High' ? 'shadow-[inset_3px_0_0_var(--warn)]' : ''}`}>
                            <div className="flex items-center justify-between gap-1">
                              <Link href={`/tickets/${encodeURIComponent(t.key)}`} draggable={false}
                                className="mono truncate text-[11px] font-medium text-[var(--accent)] hover:underline">{t.key}</Link>
                              <PriorityChip p={t.severity} />
                            </div>
                            <p className="mt-1 line-clamp-2 text-[12.5px] leading-snug text-[var(--ink)]">{t.title}</p>
                            <div className="mt-1.5 flex items-center justify-between gap-1 text-[11px] text-[var(--faint)]">
                              <span className="truncate">{t.page ?? ''}</span>
                              <span title={t.owner_name ?? 'Unassigned'}
                                className={`flex h-5 min-w-5 items-center justify-center px-1 text-[10px] font-semibold ${
                                  t.owner_name ? 'bg-[#2b57c4] text-white' : 'border border-dashed border-[var(--line)] text-[var(--faint)]'}`}>
                                {t.owner_name ? t.owner_name.slice(0, 2).toUpperCase() : '?'}
                              </span>
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
