'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Dialog } from '@/components/dialog'
import { toast } from '@/components/toast'
import { setReleaseDates } from '@/app/(app)/schedule-actions'

/** Lead only: move the release and go/no-go dates, with a reason for the log. */
export function ReleaseDateButton({ release_on, go_no_go_on }: { release_on: string; go_no_go_on: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [rel, setRel] = useState(release_on)
  const [gng, setGng] = useState(go_no_go_on)
  const [reason, setReason] = useState('')
  const [pending, start] = useTransition()
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn">Change release date</button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Change the release date">
        <form className="space-y-3" onSubmit={(e) => {
          e.preventDefault()
          start(async () => {
            const res = await setReleaseDates({ release_on: rel, go_no_go_on: gng, reason })
            if (res.error) toast(res.error, 'error')
            else { toast('Release dates saved'); setOpen(false); router.refresh() }
          })
        }}>
          <div className="grid grid-cols-2 gap-3">
            <label><span className="label">Go/no-go</span><input type="date" required value={gng} onChange={(e) => setGng(e.target.value)} className="input mt-1 w-full" /></label>
            <label><span className="label">Release</span><input type="date" required value={rel} onChange={(e) => setRel(e.target.value)} className="input mt-1 w-full" /></label>
          </div>
          <label className="block"><span className="label">Why</span>
            <textarea required minLength={3} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} className="input mt-1 w-full" />
          </label>
          <p className="text-[12px] text-[var(--muted)]">Sprint dates stay as they are; use Extend on a sprint to move sprints. Recorded in the schedule log.</p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className="btn">Cancel</button>
            <button disabled={pending} className="btn btn-primary">{pending ? 'Saving…' : 'Save dates'}</button>
          </div>
        </form>
      </Dialog>
    </>
  )
}
