'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'
import { Dialog } from '@/components/dialog'
import { toast } from '@/components/toast'
import { PriorityChip } from '@/components/ui'
import { STAGES, STAGE_LABEL, type Stage } from '@/lib/workflow/case-stage'
import { boardMove, droppableStages } from '@/lib/workflow/board-moves'
import { STATE_LABEL, type Role, type TicketState } from '@/lib/workflow/ticket-machine'
import { moveTicketFromBoard, recordCaseResult } from '@/app/(app)/actions'
import type { StandupCard } from '@/lib/standup'
import { StandupPersonCard } from '@/app/(app)/standup/standup-deck'
import { CaseDrawer } from './case-drawer'
import { TaskBoard, type SprintTask } from './task-board'

export type SprintCard = {
  id: string
  tc_id: string
  title: string
  priority: 'Critical' | 'High' | 'Medium' | 'Low'
  zone: string
  page: string
  stage: Stage
  test_by: 'auto' | 'manual'
  tester_id: string | null
  tester_name: string | null
  auto_result: string | null
  manual_result: string | null
  needs_ticket: boolean
  ticket: { id: string; key: string; state: TicketState; owner_id: string | null; owner_name: string | null } | null
}

const HELP: Record<Stage, string> = {
  test: 'QA: run it, then drag to Done or Fix',
  fix: 'Dev: fix it, then drag to Retest',
  retest: 'QA: check the fix',
  done: 'Tested and nothing open',
}
const RESULT: Record<string, [string, string]> = {
  passed: ['Passed', 'text-[var(--good)]'], failed: ['Failed', 'text-[var(--crit)]'], blocked: ['Blocked', 'text-[var(--warn)]'],
  known_defect: ['Known defect', 'text-[var(--warn)]'], skipped: ['Skipped', 'text-[var(--muted)]'],
}
const Res = ({ r }: { r: string | null }) =>
  r ? <span className={`font-semibold ${RESULT[r]?.[1] ?? ''}`}>{RESULT[r]?.[0] ?? r}</span> : <span>—</span>
const PRIORITY = ['Critical', 'High', 'Medium', 'Low']

/** Whose move a card is: the dev on the ticket while it is in Fix, otherwise the case's tester. */
function ownerOf(c: SprintCard, stage: Stage): { id: string | null; name: string | null; role: string } {
  if (stage === 'fix') return { id: c.ticket?.owner_id ?? null, name: c.ticket?.owner_name ?? null, role: 'Fix' }
  return { id: c.tester_id, name: c.tester_name, role: stage === 'retest' ? 'Retest' : 'Test' }
}

/**
 * The sprint as four steps. Drag a card to the next step and the board does that step (record a
 * pass, raise the failure, mark a fix ready, close on retest); click a card to work on it in place.
 * Filter by person to run the standup from here: ‹ › walks the team.
 */
export function SprintBoard({ cards, role, meId, people, sprints, active, areas = [], standup = [], tasks = [], today, sprintId }: {
  cards: SprintCard[]
  sprintId: string
  /** Plan tasks in this sprint, shown as their own board above the cases. */
  tasks?: SprintTask[]
  today: string
  /** One card per active person, in the order standup goes round the room. */
  standup?: StandupCard[]
  areas?: string[]
  role: Role
  meId: string
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
  const [owner, setOwner] = useState('') // '' everyone, '__none' nobody, else a person id
  const [byArea, setByArea] = useState(false)
  const [turn, setTurn] = useState<number | null>(null) // standup: whose turn, or null when not running
  // Lanes the user folded, and finished lanes they opened (finished lanes start folded).
  const [folded, setFolded] = useState<Set<string>>(new Set())
  const [unfolded, setUnfolded] = useState<Set<string>>(new Set())

  useEffect(() => setLocal({}), [cards])
  const stageOf = (c: SprintCard) => local[c.id] ?? c.stage
  const areaOf = (c: SprintCard) => `${c.zone} · ${c.page}`
  const matchesOwner = (c: SprintCard) => {
    if (!owner) return true
    const o = ownerOf(c, stageOf(c))
    return owner === '__none' ? !o.id && stageOf(c) !== 'done' : o.id === owner
  }
  const shown = cards.filter((c) => (!onlyHigh || c.priority === 'Critical' || c.priority === 'High') && (!area || areaOf(c) === area)
    && matchesOwner(c) && (!q || `${c.tc_id} ${c.title} ${c.ticket?.key ?? ''}`.toLowerCase().includes(q.toLowerCase())))
  const targets = dragging ? droppableStages(stageOf(dragging), role, dragging.ticket?.state ?? null) : []
  const lanes = [...new Set(shown.map(areaOf))].sort()
  const sortByPriority = (list: SprintCard[]) => list.sort((a, b) => PRIORITY.indexOf(a.priority) - PRIORITY.indexOf(b.priority))

  // Open work per person, for the owner filter and the standup walk.
  const load = useMemo(() => {
    const m = new Map<string, number>()
    for (const c of cards) {
      const s = local[c.id] ?? c.stage
      if (s === 'done') continue
      const id = ownerOf(c, s).id ?? '__none'
      m.set(id, (m.get(id) ?? 0) + 1)
    }
    for (const t of tasks) {
      if (t.status === 'done') continue
      const id = t.owner_id ?? '__none'
      m.set(id, (m.get(id) ?? 0) + 1)
    }
    return m
  }, [cards, local, tasks])
  // Round the room: the standup order when there is one, otherwise everyone on the team.
  const order = standup.length ? standup.map((s) => s.person.id) : people.map((p) => p.id)
  function step(d: 1 | -1) {
    if (!order.length) return
    const i = order.indexOf(owner)
    const n = i < 0 ? (d === 1 ? 0 : order.length - 1) : (i + d + order.length) % order.length
    setOwner(order[n])
    if (turn !== null) setTurn(n)
  }
  function startStandup() {
    if (!order.length) return
    setTurn(0)
    setOwner(order[0])
    setByArea(false)
  }
  function endStandup() {
    setTurn(null)
    setOwner('')
  }
  // ← → walk the room while standup runs (not while typing).
  useEffect(() => {
    if (turn === null) return
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (open || ask || t.closest('input, textarea, select, dialog')) return
      if (e.key === 'ArrowRight') { e.preventDefault(); step(1) }
      if (e.key === 'ArrowLeft') { e.preventDefault(); step(-1) }
      if (e.key === 'Escape') endStandup()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })
  const speaker = turn !== null ? standup.find((s) => s.person.id === owner) ?? null : null

  function toggleLane(lane: string, isFolded: boolean) {
    const flip = (s: Set<string>, on: boolean) => { const n = new Set(s); if (on) n.add(lane); else n.delete(lane); return n }
    setFolded((s) => flip(s, !isFolded))
    setUnfolded((s) => flip(s, isFolded))
  }

  async function perform(card: SprintCard, to: Stage, extra: { note?: string; build?: string } = {}) {
    const from = stageOf(card)
    const move = boardMove(from, to, role, card.ticket?.state ?? null)
    if ('error' in move) return toast(move.error, 'error')
    setLocal((l) => ({ ...l, [card.id]: to }))
    const res: { error?: string; ticketKey?: string } = move.kind === 'result'
      ? await recordCaseResult({ case_id: card.id, result: move.result, note: extra.note, build: extra.build, raise_ticket: move.result === 'failed' })
      : await moveTicketFromBoard({ ticket_id: card.ticket!.id, to: move.to, fixed_in_build: extra.build, note: extra.note } as Parameters<typeof moveTicketFromBoard>[0])
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

  const card = (c: SprintCard) => {
    const s = stageOf(c)
    const o = ownerOf(c, s)
    return (
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
          <span className="flex shrink-0 items-center gap-1">
            {s === 'test' && <span className="chip px-1.5 text-[10.5px]">{c.test_by === 'auto' ? 'Auto' : 'Manual'}</span>}
            <PriorityChip p={c.priority} />
          </span>
        </div>
        {!byArea && <div className="mt-1 truncate text-[11px] text-[var(--muted)]">{c.zone} · <b className="font-semibold text-[var(--ink-2)]">{c.page}</b></div>}
        <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-snug">{c.title}</p>
        <div className="mt-1 flex items-center gap-3 text-[11px] text-[var(--faint)]">
          <span>Auto <Res r={c.auto_result} /></span>
          <span>Manual <Res r={c.manual_result} /></span>
        </div>
        {c.ticket && (
          <div className="mt-1 truncate text-[11px]">
            <span className="mono text-[var(--accent)]">{c.ticket.key}</span>
            <span className="text-[var(--muted)]"> · {STATE_LABEL[c.ticket.state]}</span>
          </div>
        )}
        {c.needs_ticket && !c.ticket && <div className="mt-1 text-[11px] font-semibold text-[var(--crit)]">Needs a ticket</div>}
        {s !== 'done' && (
          <div className="mt-1.5 flex items-center gap-1.5 border-t border-[var(--line-soft)] pt-1.5 text-[11px]">
            <span className="text-[var(--faint)]">{o.role}</span>
            {o.name
              ? <b className={`font-semibold ${o.id === meId ? 'text-[var(--accent)]' : 'text-[var(--ink-2)]'}`}>{o.id === meId ? 'You' : o.name}</b>
              : <span className="font-semibold text-[var(--warn)]">No owner</span>}
          </div>
        )}
      </article>
    )
  }

  // Step headings: stick under the title bar while the page scrolls, so the columns keep their names.
  const headings = (counts: (s: Stage) => number) => (
    <div className="sticky top-14 z-10 grid grid-cols-4 gap-2 bg-[var(--bg)] pt-1 pb-2">
      {STAGES.map((stage, n) => (
        <div key={stage} className={`border-t-2 bg-white px-2.5 py-2 shadow-[0_1px_0_var(--line)] ${counts(stage) && stage !== 'done' ? 'border-[var(--navy)]' : 'border-[var(--line)]'}`}>
          <div className="flex items-baseline justify-between">
            <h3 className="text-[12.5px] font-semibold text-[var(--navy-ink)]"><span className="mono mr-1.5 text-[11px] text-[var(--faint)]">{n + 1}</span>{STAGE_LABEL[stage]}</h3>
            <span className="mono text-[11.5px] text-[var(--muted)]">{counts(stage)}</span>
          </div>
        </div>
      ))}
    </div>
  )
  const cell = (stage: Stage, list: SprintCard[], lane?: string) => {
    const can = targets.includes(stage) && (!lane || (dragging !== null && areaOf(dragging) === lane))
    return (
      <div key={stage}
        onDragOver={(e) => { if (can) e.preventDefault() }}
        onDrop={(e) => { e.preventDefault(); drop(stage) }}
        className={`min-w-0 space-y-1.5 border p-1.5 transition-colors ${lane ? '' : 'min-h-40'} ${
          can ? 'border-dashed border-[var(--navy)] bg-[var(--accent-soft)]' : `border-transparent bg-[var(--surface-2)] ${dragging && !lane ? 'opacity-60' : ''}`}`}>
        {list.map(card)}
        {list.length === 0 && (can || !lane) && <p className="py-3 text-center text-[11.5px] text-[var(--faint)]">{can ? 'Drop here' : 'Empty'}</p>}
      </div>
    )
  }
  const ownerLabel = owner === '' ? 'Everyone' : owner === '__none' ? 'No owner' : people.find((p) => p.id === owner)?.name ?? 'Someone'

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <div className="flex items-center">
          <button type="button" onClick={() => step(-1)} aria-label="Previous person" className="btn px-2">‹</button>
          <select value={owner} onChange={(e) => { setOwner(e.target.value); if (turn !== null) { const n = order.indexOf(e.target.value); if (n < 0) endStandup(); else setTurn(n) } }}
            aria-label="Person" className="select -ml-px min-w-48">
            <option value="">Everyone · {cards.filter((c) => stageOf(c) !== 'done').length + tasks.filter((t) => t.status !== 'done').length} open</option>
            <option value={meId}>Me · {load.get(meId) ?? 0} open</option>
            {people.filter((p) => p.id !== meId).map((p) => <option key={p.id} value={p.id}>{p.name} · {load.get(p.id) ?? 0} open</option>)}
            {load.has('__none') && <option value="__none">No owner · {load.get('__none')} open</option>}
          </select>
          <button type="button" onClick={() => step(1)} aria-label="Next person" className="btn -ml-px px-2">›</button>
        </div>
        {turn === null
          ? <button type="button" onClick={startStandup} className="btn btn-primary">Run standup</button>
          : <button type="button" onClick={endStandup} className="btn">End standup</button>}
        {cards.length > 0 && <>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search cases or tickets" aria-label="Search the board" className="input w-56" />
        <button type="button" onClick={() => setOnlyHigh((v) => !v)} className={`btn ${onlyHigh ? 'btn-primary' : ''}`}>Critical &amp; High</button>
        </>}
        {areas.length > 1 && (
          <>
            <select value={area} onChange={(e) => setArea(e.target.value)} className="select" aria-label="Area">
              <option value="">All {areas.length} areas</option>
              {areas.map((a) => <option key={a} value={a}>{a} · {cards.filter((c) => areaOf(c) === a).length}</option>)}
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
      </div>
      {turn !== null && (
        <div className="mb-3">
          <div className="mb-2 flex flex-wrap items-center gap-3 border border-[var(--navy)] bg-[var(--accent-soft)] px-3 py-2 text-[12.5px]">
            <b className="text-[var(--navy-ink)]">Standup · {turn + 1} of {order.length}</b>
            <span className="text-[var(--muted)]">Ask for status, then → for the next person. Esc ends it.</span>
            <span className="ml-auto flex gap-1">
              <button type="button" onClick={() => step(-1)} className="btn btn-sm">‹ Previous</button>
              <button type="button" onClick={() => step(1)} className="btn btn-sm btn-primary">{turn + 1 < order.length ? 'Next person ›' : 'Back to first ›'}</button>
            </span>
          </div>
          {speaker && <StandupPersonCard card={speaker} big />}
        </div>
      )}
      {tasks.length > 0 && <TaskBoard tasks={tasks} owner={owner} today={today} sprintId={sprintId} people={people} sprints={sprints} isLead={role === 'lead'} />}

      {cards.length > 0 && <>

      {/* One page scroll: no column scrolls, the headings stick. Narrow screens scroll sideways instead. */}
      <div className="max-lg:overflow-x-auto">
        <div className="max-lg:min-w-[760px]">
          {headings((s) => shown.filter((c) => stageOf(c) === s).length)}
          {byArea ? (
            <div className="space-y-2">
              {lanes.map((lane) => {
                const inLane = shown.filter((c) => areaOf(c) === lane)
                const left = inLane.filter((c) => stageOf(c) !== 'done').length
                const isFolded = folded.has(lane) || (left === 0 && !unfolded.has(lane))
                return (
                  <section key={lane} className="border border-[var(--line)] bg-white">
                    <button type="button" onClick={() => toggleLane(lane, isFolded)} aria-expanded={!isFolded}
                      className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left hover:bg-[var(--accent-soft)]">
                      <span className="w-3 text-[10px] text-[var(--muted)]">{isFolded ? '▸' : '▾'}</span>
                      <span className="text-[12.5px] font-semibold text-[var(--navy-ink)]">{lane}</span>
                      <span className="text-[11.5px] text-[var(--muted)]">{inLane.length} cases · {left ? `${left} left` : 'all done'}</span>
                      <span className="ml-auto flex h-1.5 w-32 bg-[var(--surface-2)]">
                        <span className="h-1.5 bg-[var(--navy)]" style={{ width: `${inLane.length ? ((inLane.length - left) / inLane.length) * 100 : 0}%` }} />
                      </span>
                    </button>
                    {!isFolded && (
                      <div className="grid grid-cols-4 gap-2 p-1.5 pt-0">
                        {STAGES.map((stage) => cell(stage, sortByPriority(inLane.filter((c) => stageOf(c) === stage)), lane))}
                      </div>
                    )}
                  </section>
                )
              })}
              {lanes.length === 0 && <p className="border border-[var(--line)] bg-white px-3 py-6 text-center text-[12.5px] text-[var(--muted)]">No cases match.</p>}
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-2">
              {STAGES.map((stage) => cell(stage, sortByPriority(shown.filter((c) => stageOf(c) === stage))))}
            </div>
          )}
        </div>
      </div>
      </>}

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
