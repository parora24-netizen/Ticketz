'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { Dialog } from '@/components/dialog'
import { toast } from '@/components/toast'
import { deleteRows, saveTask, updateTasks } from '@/app/(app)/actions'

type Status = 'not_started' | 'in_progress' | 'blocked' | 'done'
export type SprintTask = {
  id: string; num: number; phase: string; title: string; owner: string; owner_id: string | null
  due_on: string; status: Status; note: string | null
}

const COLUMNS: { key: Status; label: string }[] = [
  { key: 'not_started', label: 'Not started' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'blocked', label: 'Blocked' },
  { key: 'done', label: 'Done' },
]
const PHASES = ['1 Triage', '2 Build', '3 Stabilize', '4 Release']

/** The sprint's plan tasks as a board: drag a card to change its status, click it to edit. */
export function TaskBoard({ tasks, owner, today, sprintId, people, sprints, isLead }: {
  tasks: SprintTask[]
  owner?: string
  today: string
  sprintId: string
  people: { id: string; name: string }[]
  sprints: { id: string; name: string }[]
  isLead: boolean
}) {
  const router = useRouter()
  const [local, setLocal] = useState<Record<string, Status>>({})
  const [dragging, setDragging] = useState<SprintTask | null>(null)
  const [editing, setEditing] = useState<SprintTask | 'new' | null>(null)
  useEffect(() => setLocal({}), [tasks])
  const statusOf = (t: SprintTask) => local[t.id] ?? t.status
  const shown = owner ? tasks.filter((t) => (owner === '__none' ? !t.owner_id : t.owner_id === owner)) : tasks

  async function drop(to: Status) {
    const t = dragging
    setDragging(null)
    if (!t || statusOf(t) === to) return
    const from = statusOf(t)
    setLocal((l) => ({ ...l, [t.id]: to }))
    const res = await updateTasks([t.id], { status: to })
    if (res.error) { setLocal((l) => ({ ...l, [t.id]: from })); toast(res.error, 'error') }
    else { toast(`#${t.num}: ${COLUMNS.find((c) => c.key === to)!.label}`); router.refresh() }
  }

  return (
    <section className="mb-4">
      <header className="mb-2 flex flex-wrap items-baseline gap-3">
        <h3 className="text-[14px] font-semibold text-[var(--navy-ink)]">Tasks · {shown.filter((t) => statusOf(t) === 'done').length} of {shown.length} done</h3>
        <span className="ml-auto flex items-center gap-3">
          <Link href="/plan" className="text-[12px] text-[var(--accent)] hover:underline">Move tasks in from the plan</Link>
          {isLead && <button type="button" onClick={() => setEditing('new')} className="btn btn-sm btn-primary">+ Add task</button>}
        </span>
      </header>
      <div className="max-lg:overflow-x-auto">
        {/* Empty columns shrink to a slim drop target; full ones share the width and lay cards out in a grid. */}
        <div className="grid gap-2 max-lg:min-w-[760px]"
          style={{ gridTemplateColumns: COLUMNS.map((c) => (shown.some((t) => statusOf(t) === c.key) ? 'minmax(0,1fr)' : '150px')).join(' ') }}>
          {COLUMNS.map((col) => {
            const list = shown.filter((t) => statusOf(t) === col.key)
            const can = !!dragging && statusOf(dragging) !== col.key
            return (
              <div key={col.key}
                onDragOver={(e) => { if (can) e.preventDefault() }}
                onDrop={(e) => { e.preventDefault(); void drop(col.key) }}
                className={`min-w-0 border p-1.5 ${can ? 'border-dashed border-[var(--navy)] bg-[var(--accent-soft)]' : 'border-transparent bg-[var(--surface-2)]'}`}>
                <div className={`mb-1.5 flex items-baseline justify-between border-t-2 px-1 pt-1.5 ${col.key === 'blocked' && list.length ? 'border-[var(--crit)]' : list.length && col.key !== 'done' ? 'border-[var(--navy)]' : 'border-[var(--line)]'}`}>
                  <span className="text-[12.5px] font-semibold text-[var(--navy-ink)]">{col.label}</span>
                  <span className="mono text-[11.5px] text-[var(--muted)]">{list.length}</span>
                </div>
                <div className="grid gap-1.5 [grid-template-columns:repeat(auto-fill,minmax(250px,1fr))]">
                  {list.map((t) => {
                    const late = statusOf(t) !== 'done' && t.due_on < today
                    return (
                      <article key={t.id} draggable tabIndex={0}
                        onDragStart={() => setDragging(t)} onDragEnd={() => setDragging(null)}
                        onClick={() => setEditing(t)} onKeyDown={(e) => { if (e.key === 'Enter') setEditing(t) }}
                        className="cursor-pointer border border-[var(--line)] bg-white p-2 outline-none hover:border-[var(--navy)] focus-visible:border-[var(--navy)]">
                        <div className="flex items-center justify-between gap-2 text-[11px]">
                          <span className="mono text-[var(--faint)]">#{t.num} · {t.phase}</span>
                          <span className={`mono ${late ? 'font-semibold text-[var(--crit)]' : 'text-[var(--muted)]'}`}>{t.due_on.slice(5)}{late ? ' late' : ''}</span>
                        </div>
                        <p className="mt-1 text-[12.5px] leading-snug">{t.title}</p>
                        {t.note && <p className="mt-1 line-clamp-2 text-[11.5px] text-[var(--muted)]">{t.note}</p>}
                        <div className="mt-1.5 border-t border-[var(--line-soft)] pt-1.5 text-[11px]">
                          <span className="text-[var(--faint)]">Owner </span>
                          {t.owner_id || (t.owner && t.owner !== 'Unassigned')
                            ? <b className="font-semibold text-[var(--ink-2)]">{t.owner}</b>
                            : <span className="font-semibold text-[var(--warn)]">No owner</span>}
                        </div>
                      </article>
                    )
                  })}
                  {list.length === 0 && can && <p className="py-2 text-center text-[11.5px] text-[var(--faint)]">Drop here</p>}
                </div>
              </div>
            )
          })}
        </div>
      </div>
      <Dialog open={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? 'Add a task' : editing ? `Task #${editing.num}` : ''}>
        {editing && (
          <TaskForm key={editing === 'new' ? 'new' : editing.id} task={editing === 'new' ? null : editing} sprintId={sprintId} today={today}
            people={people} sprints={sprints} isLead={isLead} onDone={() => { setEditing(null); router.refresh() }} />
        )}
      </Dialog>
    </section>
  )
}

function TaskForm({ task, sprintId, today, people, sprints, isLead, onDone }: {
  task: SprintTask | null; sprintId: string; today: string
  people: { id: string; name: string }[]; sprints: { id: string; name: string }[]; isLead: boolean; onDone: () => void
}) {
  const [pending, start] = useTransition()
  const [title, setTitle] = useState(task?.title ?? '')
  const [phase, setPhase] = useState(task?.phase ?? PHASES[0])
  // A person if the owner is one of the team; otherwise the free-text label (e.g. "Jaspreet, Parikshit").
  const [ownerId, setOwnerId] = useState(task?.owner_id ?? '')
  const [ownerLabel, setOwnerLabel] = useState(task && !task.owner_id ? task.owner : '')
  const [due, setDue] = useState(task?.due_on ?? today)
  const [status, setStatus] = useState<Status>(task?.status ?? 'not_started')
  const [sprint, setSprint] = useState(sprintId)
  const [note, setNote] = useState(task?.note ?? '')

  return (
    <form className="space-y-3" onSubmit={(e) => {
      e.preventDefault()
      start(async () => {
        const res = await saveTask(task?.id ?? null, {
          title, phase, owner_id: ownerId || null, owner_label: ownerId ? undefined : ownerLabel,
          due_on: due, status, sprint_id: sprint || null, note: note.trim() || null,
        })
        if (res.error) toast(res.error, 'error')
        else { toast(task ? `#${task.num} saved` : 'Task added'); onDone() }
      })
    }}>
      <label className="block"><span className="label">Task</span>
        <textarea required minLength={3} rows={2} value={title} onChange={(e) => setTitle(e.target.value)} className="input mt-1 w-full" autoFocus={!task} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block"><span className="label">Owner</span>
          <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} className="select mt-1 w-full">
            <option value="">{ownerLabel ? `Text: ${ownerLabel}` : 'No owner'}</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label className="block"><span className="label">Due</span>
          <input type="date" required value={due} onChange={(e) => setDue(e.target.value)} className="input mt-1 w-full" />
        </label>
        <label className="block"><span className="label">Status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value as Status)} className="select mt-1 w-full">
            {COLUMNS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        </label>
        <label className="block"><span className="label">Sprint</span>
          <select value={sprint} onChange={(e) => setSprint(e.target.value)} className="select mt-1 w-full">
            <option value="">No sprint (back to the plan)</option>
            {sprints.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label className="block"><span className="label">Phase</span>
          <select value={phase} onChange={(e) => setPhase(e.target.value)} className="select mt-1 w-full">
            {[...new Set([...PHASES, phase])].map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
        {!ownerId && (
          <label className="block"><span className="label">Owner as text</span>
            <input value={ownerLabel} onChange={(e) => setOwnerLabel(e.target.value)} placeholder="e.g. Uday with zone owners" className="input mt-1 w-full" />
          </label>
        )}
      </div>
      <label className="block"><span className="label">Note</span>
        <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Status, blockers, links" className="input mt-1 w-full" />
      </label>
      <div className="flex items-center gap-2 border-t border-[var(--line)] pt-3">
        {task && isLead && (
          <button type="button" disabled={pending} className="btn border-[var(--crit-line)] text-[var(--crit)] hover:border-[var(--crit)] hover:text-[var(--crit)]"
            onClick={() => {
              if (!window.confirm(`Delete task #${task.num} for good? This cannot be undone.`)) return
              start(async () => {
                const res = await deleteRows('plan_tasks', [task.id])
                if (res.error) toast(res.error, 'error')
                else { toast(`#${task.num} deleted`); onDone() }
              })
            }}>Delete</button>
        )}
        <span className="ml-auto" />
        <button type="button" onClick={onDone} className="btn">Cancel</button>
        <button disabled={pending} className="btn btn-primary">{pending ? 'Saving…' : task ? 'Save' : 'Add task'}</button>
      </div>
    </form>
  )
}
