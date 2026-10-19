'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { toast } from '@/components/toast'
import { updateTasks } from '@/app/(app)/actions'

export type SprintTask = { id: string; num: number; phase: string; title: string; owner: string; owner_id: string | null; due_on: string; status: Status }
type Status = 'not_started' | 'in_progress' | 'blocked' | 'done'

const COLUMNS: { key: Status; label: string }[] = [
  { key: 'not_started', label: 'Not started' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'blocked', label: 'Blocked' },
  { key: 'done', label: 'Done' },
]

/** The sprint's plan tasks as a board: drag a card to change its status. */
export function TaskBoard({ tasks, owner, today }: { tasks: SprintTask[]; owner?: string; today: string }) {
  const router = useRouter()
  const [local, setLocal] = useState<Record<string, Status>>({})
  const [dragging, setDragging] = useState<SprintTask | null>(null)
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
      <header className="mb-2 flex items-baseline justify-between">
        <h3 className="text-[14px] font-semibold text-[var(--navy-ink)]">Tasks · {shown.filter((t) => statusOf(t) === 'done').length} of {shown.length} done</h3>
        <Link href="/plan" className="text-[12px] text-[var(--accent)] hover:underline">Add or move tasks on the plan</Link>
      </header>
      <div className="max-lg:overflow-x-auto">
        <div className="grid grid-cols-4 gap-2 max-lg:min-w-[760px]">
          {COLUMNS.map((col) => {
            const list = shown.filter((t) => statusOf(t) === col.key)
            const can = !!dragging && statusOf(dragging) !== col.key
            return (
              <div key={col.key}
                onDragOver={(e) => { if (can) e.preventDefault() }}
                onDrop={(e) => { e.preventDefault(); void drop(col.key) }}
                className={`min-h-24 border p-1.5 ${can ? 'border-dashed border-[var(--navy)] bg-[var(--accent-soft)]' : 'border-transparent bg-[var(--surface-2)]'}`}>
                <div className={`mb-1.5 flex items-baseline justify-between border-t-2 px-1 pt-1.5 ${col.key === 'blocked' && list.length ? 'border-[var(--crit)]' : list.length && col.key !== 'done' ? 'border-[var(--navy)]' : 'border-[var(--line)]'}`}>
                  <span className="text-[12.5px] font-semibold text-[var(--navy-ink)]">{col.label}</span>
                  <span className="mono text-[11.5px] text-[var(--muted)]">{list.length}</span>
                </div>
                <div className="space-y-1.5">
                  {list.map((t) => {
                    const late = statusOf(t) !== 'done' && t.due_on < today
                    return (
                      <article key={t.id} draggable onDragStart={() => setDragging(t)} onDragEnd={() => setDragging(null)}
                        className="cursor-grab border border-[var(--line)] bg-white p-2 hover:border-[var(--navy)]">
                        <div className="flex items-center justify-between gap-2 text-[11px]">
                          <span className="mono text-[var(--faint)]">#{t.num} · {t.phase}</span>
                          <span className={`mono ${late ? 'font-semibold text-[var(--crit)]' : 'text-[var(--muted)]'}`}>{t.due_on.slice(5)}{late ? ' late' : ''}</span>
                        </div>
                        <p className="mt-1 text-[12.5px] leading-snug">{t.title}</p>
                        <div className="mt-1.5 border-t border-[var(--line-soft)] pt-1.5 text-[11px]">
                          <span className="text-[var(--faint)]">Owner </span><b className="font-semibold text-[var(--ink-2)]">{t.owner}</b>
                        </div>
                      </article>
                    )
                  })}
                  {list.length === 0 && <p className="py-2 text-center text-[11.5px] text-[var(--faint)]">{can ? 'Drop here' : 'Empty'}</p>}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
