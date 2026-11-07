'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { createPortal } from 'react-dom'
import { Dialog } from '@/components/dialog'
import { toast } from '@/components/toast'
import { setZoneInRelease, updateSprint } from './actions'

type EditableSprint = { id: string; name: string; status: string; starts_on: string; ends_on: string; goal: string | null; owner_id: string | null; owner_all: boolean }

/** Lead only: a sprint's dates as a button that opens its dates, goal and owner. */
export function SprintDatesButton({ sprint, label, goNoGo, team }: { sprint: EditableSprint; label: string; goNoGo: string; team: { value: string; label: string }[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [starts, setStarts] = useState(sprint.starts_on)
  const [ends, setEnds] = useState(sprint.ends_on)
  const [goal, setGoal] = useState(sprint.goal ?? '')
  const [owner, setOwner] = useState(sprint.owner_all ? 'all' : sprint.owner_id ?? '')
  const [shiftLater, setShiftLater] = useState(false)
  const [pending, start] = useTransition()
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} title={`Edit ${sprint.name}`} className="mono cursor-pointer text-[12px] whitespace-nowrap hover:text-[var(--accent)] hover:underline">{label} <span className="text-[10px] text-[var(--faint)]">✎</span></button>
      {/* Out of the table, whose cells would pass on their mono, no-wrap text. */}
      {open && createPortal(<Dialog open onClose={() => setOpen(false)} title={`Edit ${sprint.name}`}>
        <form className="space-y-3" onSubmit={(e) => {
          e.preventDefault()
          start(async () => {
            const res = await updateSprint({ sprint_id: sprint.id, starts_on: starts, ends_on: ends, goal, owner_id: owner && owner !== 'all' ? owner : null, owner_all: owner === 'all', shift_later: shiftLater })
            if (res.error) toast(res.error, 'error')
            else { toast(`${sprint.name} saved`); setOpen(false); router.refresh() }
          })
        }}>
          <div className="grid grid-cols-2 gap-3">
            <label><span className="label">Starts</span><input type="date" required value={starts} onChange={(e) => setStarts(e.target.value)} className="input mt-1 w-full" /></label>
            <label><span className="label">Ends</span><input type="date" required value={ends} onChange={(e) => setEnds(e.target.value)} className="input mt-1 w-full" /></label>
          </div>
          <label className="block"><span className="label">Goal</span><input value={goal} onChange={(e) => setGoal(e.target.value)} className="input mt-1 w-full" /></label>
          <label className="block"><span className="label">Owner</span>
            <select value={owner} onChange={(e) => setOwner(e.target.value)} className="select mt-1 w-full">
              <option value="">No owner</option>
              <option value="all">All</option>
              {team.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
          </label>
          <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={shiftLater} onChange={(e) => setShiftLater(e.target.checked)} /> Move later sprints by the same number of days</label>
          {ends > goNoGo && <p className="text-[12.5px] font-semibold text-[var(--warn)]">This ends after go/no-go; the release dates may need to move too.</p>}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className="btn">Cancel</button>
            <button disabled={pending} className="btn btn-primary">{pending ? 'Saving…' : 'Save'}</button>
          </div>
        </form>
      </Dialog>, document.body)}
    </>
  )
}

/** Lead only: leave a zone out of this release, or add it back. */
export function ZonesInRelease({ inZones, outZones }: { inZones: string[]; outZones: { zone: string; pages: number }[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [zone, setZone] = useState('')
  function set(z: string, on: boolean) {
    if (!on && !window.confirm(`Leave ${z} out of this release? It leaves the plan until you add it back; its pages and cases stay.`)) return
    start(async () => {
      const res = await setZoneInRelease(z, on)
      if (res.error) toast(res.error, 'error')
      else { toast(on ? `${z} is back in the plan` : `${z} left out of this release`); setZone(''); router.refresh() }
    })
  }
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[12.5px]">
      <span className="flex items-center gap-2">
        <select aria-label="Zone to leave out" value={zone} onChange={(e) => setZone(e.target.value)} className="select h-8 w-48">
          <option value="">Choose a zone…</option>
          {inZones.map((z) => <option key={z} value={z}>{z}</option>)}
        </select>
        <button type="button" disabled={!zone || pending} onClick={() => set(zone, false)} className="btn btn-sm">Leave out of this release</button>
      </span>
      {outZones.length > 0 && <span className="text-[var(--muted)]">Not in this release:</span>}
      {outZones.map((z) => (
        <span key={z.zone}>
          <b className="text-[var(--navy-ink)]">{z.zone}</b> <span className="text-[var(--muted)]">{z.pages} pages</span>
          <button type="button" disabled={pending} onClick={() => set(z.zone, true)} className="ml-1.5 text-[var(--accent)] hover:underline">Add back</button>
        </span>
      ))}
    </div>
  )
}
