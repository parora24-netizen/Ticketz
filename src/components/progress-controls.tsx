'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { toast } from '@/components/toast'
import { updatePageWriting } from '@/app/(app)/cases/progress/actions'

type Opt = { value: string; label: string }

function useSave(areaId: string) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const save = (patch: Parameters<typeof updatePageWriting>[1], ok?: string) =>
    start(async () => {
      const res = await updatePageWriting(areaId, patch)
      if (res.error) toast(res.error, 'error')
      else { if (ok) toast(ok); router.refresh() }
    })
  return { pending, save }
}

/** Lead: who writes a page's cases. */
export function WriterSelect({ areaId, ownerId, people }: { areaId: string; ownerId: string | null; people: Opt[] }) {
  const { pending, save } = useSave(areaId)
  return (
    <select aria-label="Writer" disabled={pending} defaultValue={ownerId ?? ''} className="select h-7 py-0 text-[12px]"
      onChange={(e) => save({ owner_id: e.target.value || null })}>
      <option value="">No one</option>
      {people.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
    </select>
  )
}

/** Lead: when a page still being written is due. */
export function DueDate({ areaId, dueOn }: { areaId: string; dueOn: string | null }) {
  const { pending, save } = useSave(areaId)
  return (
    <label className="inline-flex items-center gap-1 text-[11.5px] text-[var(--muted)]">
      due
      <input type="date" aria-label="Due" disabled={pending} defaultValue={dueOn ?? ''} className="input h-7 w-[8.5rem] py-0 text-[12px]"
        onChange={(e) => save({ due_on: e.target.value || null })} />
    </label>
  )
}

/** The writer or lead: mark a page's cases completed (as on the Framework tab), or reopen it. */
export function WrittenButton({ areaId, done, page }: { areaId: string; done: boolean; page: string }) {
  const { pending, save } = useSave(areaId)
  return (
    <button type="button" disabled={pending} className="btn btn-sm"
      onClick={() => save({ done: !done }, done ? `${page} reopened for writing` : `${page} marked completed`)}>
      {done ? 'Reopen' : 'Mark completed'}
    </button>
  )
}
