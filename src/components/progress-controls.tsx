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

/** Lead: who writes a page's cases and when they are due. */
export function PageOwnerFields({ areaId, ownerId, dueOn, people }: { areaId: string; ownerId: string | null; dueOn: string | null; people: Opt[] }) {
  const { pending, save } = useSave(areaId)
  return (
    <span className="flex items-center gap-1.5">
      <select aria-label="Writer" disabled={pending} defaultValue={ownerId ?? ''} className="select h-7 py-0 text-[12px]"
        onChange={(e) => save({ owner_id: e.target.value || null })}>
        <option value="">No one</option>
        {people.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
      </select>
      <input type="date" aria-label="Due" disabled={pending} defaultValue={dueOn ?? ''} className="input h-7 w-[8.5rem] py-0 text-[12px]"
        onChange={(e) => save({ due_on: e.target.value || null })} />
    </span>
  )
}

/** The writer or lead: mark a page's cases written, or reopen it. */
export function WrittenButton({ areaId, done, page }: { areaId: string; done: boolean; page: string }) {
  const { pending, save } = useSave(areaId)
  return (
    <button type="button" disabled={pending} className="btn btn-sm"
      onClick={() => save({ done: !done }, done ? `${page} reopened for writing` : `${page} marked written`)}>
      {done ? 'Reopen' : 'Mark written'}
    </button>
  )
}
