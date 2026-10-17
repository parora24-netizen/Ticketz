'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { Dialog } from '@/components/dialog'
import { toast } from '@/components/toast'
import { PriorityChip } from '@/components/ui'
import { STAGES, STAGE_LABEL, type Stage } from '@/lib/workflow/case-stage'
import { boardMove, droppableStages } from '@/lib/workflow/board-moves'
import { STATE_LABEL, type Role, type TicketState } from '@/lib/workflow/ticket-machine'
import { moveTicketFromBoard, recordCaseResult, updateCases } from '@/app/(app)/actions'
import { CaseDrawer } from './case-drawer'

export type SprintCard = {
  id: string
  tc_id: string
  title: string
  priority: 'Critical' | 'High' | 'Medium' | 'Low'
  area: string
  stage: Stage
  auto_result: string | null
  manual_result: string | null
  needs_ticket: boolean
  ticket: { id: string; key: string; state: TicketState; owner_name: string | null } | null
}

const HELP: Record<Stage, string> = {
  automate: 'Automate it, or mark it manual only',
  auto_run: 'Waiting for an automated run',
  manual: 'Needs a manual result',
  fix: 'Failed; ticket open or to raise',
  retest: 'Fixed; waiting for QA to retest',
  done: 'Tested and nothing open',
}
const RESULT: Record<string, [string, string]> = {
  passed: ['Passed', 'text-[var(--good)]'], failed: ['Failed', 'text-[var(--crit)]'], blocked: ['Blocked', 'text-[var(--warn)]'],
  known_defect: ['Known defect', 'text-[var(--warn)]'], skipped: ['Skipped', 'text-[var(--muted)]'],
}
const Res = ({ r }: { r: string | null }) =>
  r ? <span className={`font-semibold ${RESULT[r]?.[1] ?? ''}`}>{RESULT[r]?.[0] ?? r}</span> : <span>—</span>

const PER_COLUMN = 60
const PRIORITY = ['Critical', 'High', 'Medium', 'Low']

/**
 * The sprint as six steps. Drag a card to the next step and the board does that step (record a
 * pass, raise the failure, mark a fix ready, close on retest); click a card to work on it in place.
 */
export function SprintBoard({ cards, role, sprintId, people, sprints, active, areas = [] }: {
  cards: SprintCard[]
  areas?: string[]
  role: Role
  sprintId: string
  people: { id: string; name: string }[]
  sprints: { id: string; name: string }[]
  active: boolean
}) {
  const router = useRouter()
  const [local, setLocal] = useState<Record<string, Stage>>({})
  const [dragging, setDragging] = useState<SprintCard | null>(null)
  const [ask, setAsk] = useState<{ card: SprintCard; to: Stage; kind: 'fail' | 'build' | 'note' } | null>(null)
  const [text, setText] = useState('')
  const [build, setBuild] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [q, setQ] = useState('')
  const [onlyHigh, setOnlyHigh] = useState(false)
  const [area, setArea] = useState('')
  const [byArea, setByArea] = useState(false)
  // Lanes the user folded, and finished lanes they opened (finished lanes start folded).
  const [folded, setFolded] = useState<Set<string>>(new Set())
  const [unfolded, setUnfolded] = useState<Set<string>>(new Set())
  function toggleLane(lane: string, isFolded: boolean) {
    const flip = (s: Set<string>, on: boolean) => { const n = new Set(s); if (on) n.add(lane); else n.delete(lane); return n }
    setFolded((s) => flip(s, !isFolded))
    setUnfolded((s) => flip(s, isFolded))
  }

  useEffect(() => setLocal({}), [cards])
  const stageOf = (c: SprintCard) => local[c.id] ?? c.stage
  const shown = useMemo(
    () => cards.filter((c) => (!onlyHigh || c.priority === 'Critical' || c.priority === 'High') && (!area || c.area === area)
      && (!q || `${c.tc_id} ${c.title} ${c.ticket?.key ?? ''}`.toLowerCase().includes(q.toLowerCase()))),
    [cards, q, onlyHigh, area],
  )
  const targets = dragging ? droppableStages(stageOf(dragging), role, dragging.ticket?.state ?? null) : []
  const lanes = useMemo(() => [...new Set(shown.map((c) => c.area))].sort(), [shown])
  const sortByPriority = (list: SprintCard[]) => list.sort((a, b) => PRIORITY.indexOf(a.priority) - PRIORITY.indexOf(b.priority))

  const card = (c: SprintCard) => (
    <article key={c.id} draggable
      onDragStart={(e) => { setDragging(c); e.dataTransfer.effectAllowed = 'move' }}
      onDragEnd={() => setDragging(null)}
      onClick={() => setOpen(c.id)}
      onKeyDown={(e) => { if (e.key === 'Enter') setOpen(c.id) }}
      tabIndex={0}
      className={`cursor-pointer border bg-white p-2 outline-none hover:border-[var(--navy)] focus-visible:border-[var(--navy)] ${open === c.id ? 'border-[var(--navy)]' : 'border-[var(--line)]'} ${
        c.priority === 'Critical' ? 'shadow-[inset_3px_0_0_var(--crit)]' : c.priority === 'High' ? 'shadow-[inset_3px_0_0_var(--warn)]' : ''}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="mono truncate text-[11.5px] font-medium text-[var(--accent)]">{c.tc_id}</span>
        <PriorityChip p={c.priority} />
      </div>
      <p className="mt-1 line-clamp-2 text-[12.5px] leading-snug">{c.title}</p>
      <div className="mt-1 flex items-center gap-3 text-[11px] text-[var(--faint)]">
        <span>Auto <Res r={c.auto_result} /></span>
        <span>Manual <Res r={c.manual_result} /></span>
      </div>
      {c.ticket && (
        <div className="mt-1 flex items-center gap-1.5 text-[11px]">
          <span className="mono text-[var(--accent)]">{c.ticket.key}</span>
          <span className="text-[var(--muted)]">· {STATE_LABEL[c.ticket.state]}{c.ticket.owner_name ? ` · ${c.ticket.owner_name}` : ''}</span>
        </div>
      )}
      {c.needs_ticket && !c.ticket && <div className="mt-1 text-[11px] font-semibold text-[var(--crit)]">Needs a ticket</div>}
    </article>
  )

  async function perform(card: SprintCard, to: Stage, extra: { note?: string; build?: string } = {}) {
    const move = boardMove(stageOf(card), to, role, card.ticket?.state ?? null)
    if ('error' in move) return toast(move.error, 'error')
    const from = stageOf(card)
    setLocal((l) => ({ ...l, [card.id]: to }))
    let res: { error?: string; ticketKey?: string }
    if (move.kind === 'automation') res = await updateCases([card.id], { automation: move.value })
    else if (move.kind === 'result') res = await recordCaseResult({ case_id: card.id, result: move.result, note: extra.note, build: extra.build, raise_ticket: move.result === 'failed' })
    else res = await moveTicketFromBoard({ ticket_id: card.ticket!.id, to: move.to, fixed_in_build: extra.build, note: extra.note } as Parameters<typeof moveTicketFromBoard>[0])
    if (res.error) {
      setLocal((l) => ({ ...l, [card.id]: from }))
      toast(`${card.tc_id}: ${res.error}`, 'error')
    } else {
      toast(`${card.tc_id}: ${move.label}${res.ticketKey ? ` · ticket ${res.ticketKey}` : ''}`)
      router.refresh()
    }
  }

  function drop(to: Stage) {
    const card = dragging
    setDragging(null)
    if (!card || stageOf(card) === to) return
    const move = boardMove(stageOf(card), to, role, card.ticket?.state ?? null)
    if ('error' in move) return toast(move.error, 'error')
    if (move.kind === 'result' && !active) return toast('Start the sprint before recording results, so they count toward it.', 'error')
    if (move.kind === 'result' && move.ask) { setText(''); setBuild(''); setAsk({ card, to, kind: 'fail' }); return }
    if (move.kind === 'ticket' && move.ask) { setText(''); setBuild(''); setAsk({ card, to, kind: move.ask }); return }
    void perform(card, to)
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search cases or tickets" aria-label="Search the board" className="input w-60" />
        <button type="button" onClick={() => setOnlyHigh((v) => !v)} className={`btn ${onlyHigh ? 'btn-primary' : ''}`}>Critical &amp; High</button>
        {areas.length > 1 && (
          <>
            <select value={area} onChange={(e) => setArea(e.target.value)} className="select" aria-label="Area">
              <option value="">All {areas.length} areas</option>
              {areas.map((a) => <option key={a} value={a}>{a} · {cards.filter((c) => c.area === a).length}</option>)}
            </select>
            <button type="button" onClick={() => setByArea((v) => !v)} className={`btn ${byArea ? 'btn-primary' : ''}`}>Group by area</button>
            {byArea && (
              <>
                <button type="button" className="text-[12px] text-[var(--accent)] hover:underline" onClick={() => { setFolded(new Set()); setUnfolded(new Set(lanes)) }}>Open all</button>
                <button type="button" className="text-[12px] text-[var(--accent)] hover:underline" onClick={() => { setFolded(new Set(lanes)); setUnfolded(new Set()) }}>Fold all</button>
              </>
            )}
          </>
        )}
        <span className="text-[12px] text-[var(--muted)]">
          {active ? 'Drag a card to its next step, or click it to work on it here.' : 'Start the sprint to record results; you can still open cards and move automation.'}
        </span>
      </div>

      {byArea ? (
        // Swimlanes: the six step headings once at the top, then one row per area. A row can be
        // folded away; rows with nothing left to do start folded so the work stands out.
        <div className="overflow-x-auto pb-2">
          <div className="min-w-[1180px] border border-[var(--line)] bg-white">
            <div className="grid grid-cols-6 border-b border-[var(--line)] bg-[var(--surface-2)]">
              {STAGES.map((stage, n) => (
                <div key={stage} className="border-l border-[var(--line-soft)] px-2.5 py-2 first:border-l-0">
                  <div className="flex items-baseline justify-between">
                    <h3 className="text-[12.5px] font-semibold text-[var(--navy-ink)]"><span className="mono mr-1.5 text-[11px] text-[var(--faint)]">{n + 1}</span>{STAGE_LABEL[stage]}</h3>
                    <span className="mono text-[11.5px] text-[var(--muted)]">{shown.filter((c) => stageOf(c) === stage).length}</span>
                  </div>
                  <p className="text-[11px] leading-snug text-[var(--muted)]">{HELP[stage]}</p>
                </div>
              ))}
            </div>
            {lanes.map((lane) => {
              const inLane = shown.filter((c) => c.area === lane)
              const left = inLane.filter((c) => stageOf(c) !== 'done').length
              const isFolded = folded.has(lane) || (left === 0 && !unfolded.has(lane))
              return (
                <div key={lane} className="border-b border-[var(--line)] last:border-b-0">
                  <button type="button" onClick={() => toggleLane(lane, isFolded)} aria-expanded={!isFolded}
                    className="flex w-full items-center gap-2 bg-[var(--surface-3)] px-2.5 py-1.5 text-left hover:bg-[var(--accent-soft)]">
                    <span className="w-3 text-[10px] text-[var(--muted)]">{isFolded ? '▸' : '▾'}</span>
                    <span className="text-[12.5px] font-semibold text-[var(--navy-ink)]">{lane}</span>
                    <span className="text-[11.5px] text-[var(--muted)]">{inLane.length} cases · {left ? `${left} left` : 'all done'}</span>
                    <span className="ml-auto flex h-1.5 w-32 bg-[var(--surface-2)]">
                      <span className="h-1.5 bg-[var(--navy)]" style={{ width: `${inLane.length ? ((inLane.length - left) / inLane.length) * 100 : 0}%` }} />
                    </span>
                  </button>
                  {!isFolded && (
                    <div className="grid grid-cols-6">
                      {STAGES.map((stage) => {
                        const list = sortByPriority(inLane.filter((c) => stageOf(c) === stage))
                        const can = targets.includes(stage) && dragging?.area === lane
                        return (
                          <div key={stage}
                            onDragOver={(e) => { if (can) e.preventDefault() }}
                            onDrop={(e) => { e.preventDefault(); drop(stage) }}
                            className={`min-w-0 space-y-1.5 border-l p-1.5 first:border-l-0 ${can ? 'border-dashed border-[var(--navy)] bg-[var(--accent-soft)]' : 'border-[var(--line-soft)]'}`}>
                            {list.map(card)}
                            {list.length === 0 && can && <p className="py-2 text-center text-[11.5px] text-[var(--faint)]">Drop here</p>}
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>
              )
            })}
            {lanes.length === 0 && <p className="px-3 py-6 text-center text-[12.5px] text-[var(--muted)]">No cases match.</p>}
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto pb-2">
          <div className="grid min-w-[1180px] grid-cols-6 gap-2">
            {STAGES.map((stage, n) => {
              const list = sortByPriority(shown.filter((c) => stageOf(c) === stage))
              const can = targets.includes(stage)
              return (
                <section key={stage}
                  onDragOver={(e) => { if (can) e.preventDefault() }}
                  onDrop={(e) => { e.preventDefault(); drop(stage) }}
                  className={`flex min-w-0 flex-col border transition-colors ${
                    can ? 'border-dashed border-[var(--navy)] bg-[var(--accent-soft)]' : dragging ? 'border-transparent bg-[var(--surface-2)] opacity-60' : 'border-transparent bg-[var(--surface-2)]'}`}>
                  <header className={`border-t-2 px-2.5 pt-2 pb-2 ${list.length && stage !== 'done' ? 'border-[var(--navy)]' : 'border-[var(--line)]'}`}>
                    <div className="flex items-baseline justify-between">
                      <h3 className="text-[12.5px] font-semibold text-[var(--navy-ink)]"><span className="mono mr-1.5 text-[11px] text-[var(--faint)]">{n + 1}</span>{STAGE_LABEL[stage]}</h3>
                      <span className="mono text-[11.5px] text-[var(--muted)]">{list.length}</span>
                    </div>
                    <p className="text-[11px] leading-snug text-[var(--muted)]">{HELP[stage]}</p>
                  </header>
                  <div className="max-h-[calc(100vh-330px)] min-h-24 space-y-1.5 overflow-y-auto px-1.5 pb-1.5">
                    {list.slice(0, PER_COLUMN).map(card)}
                    {list.length === 0 && <p className="px-1 py-3 text-center text-[11.5px] text-[var(--faint)]">{can ? 'Drop here' : 'Empty'}</p>}
                    {list.length > PER_COLUMN && (
                      <Link href={`/cases?sprint=${sprintId}&stage=${stage}`} className="block px-1 py-1 text-[12px] text-[var(--accent)] hover:underline">
                        All {list.length} in the grid
                      </Link>
                    )}
                  </div>
                </section>
              )
            })}
          </div>
        </div>
      )}

      <Dialog open={!!ask} onClose={() => setAsk(null)}
        title={ask?.kind === 'fail' ? `Record a failure · ${ask.card.tc_id}` : ask?.kind === 'build' ? 'Which build has the fix?' : 'What did the retest show?'}>
        {ask && (
          <form className="space-y-3" onSubmit={(e) => {
            e.preventDefault()
            const a = ask
            setAsk(null)
            void perform(a.card, a.to, a.kind === 'build' ? { build: build.trim() } : { note: text.trim() || undefined, build: build.trim() || undefined })
          }}>
            {ask.kind !== 'build' && (
              <label className="block"><span className="label">{ask.kind === 'fail' ? 'What happened' : 'Note for the developer'}</span>
                <textarea autoFocus rows={3} value={text} onChange={(e) => setText(e.target.value)} className="input mt-1 w-full" />
              </label>
            )}
            {ask.kind !== 'note' && (
              <label className="block"><span className="label">{ask.kind === 'build' ? 'Build' : 'Build tested (optional)'}</span>
                <input autoFocus={ask.kind === 'build'} required={ask.kind === 'build'} value={build} onChange={(e) => setBuild(e.target.value)} placeholder="e.g. b39a5eab1" className="input mono mt-1 w-full" />
              </label>
            )}
            {ask.kind === 'fail' && <p className="text-[12px] text-[var(--muted)]">A ticket is raised for it, unless one is already open.</p>}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setAsk(null)} className="btn">Cancel</button>
              <button className="btn btn-primary">{ask.kind === 'fail' ? 'Record fail' : ask.kind === 'build' ? 'Ready for retest' : 'Reopen ticket'}</button>
            </div>
          </form>
        )}
      </Dialog>

      <CaseDrawer caseId={open} onClose={() => setOpen(null)} role={role} people={people} sprints={sprints} active={active} />
    </div>
  )
}
