'use client'

import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import { Dialog } from '@/components/dialog'
import { toast } from '@/components/toast'
import { planExtension, type SprintDates } from '@/lib/schedule'
import { extendSprint, finishSprint } from '@/app/(app)/schedule-actions'

const fmt = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })

/** "Edit sprint" in the header: the dates-and-areas form in a dialog. */
export function EditSprintButton({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn">Edit sprint</button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Edit sprint" wide>{children}</Dialog>
    </>
  )
}

/** Extend by working days, with a live preview of what else moves (later sprints, the release). */
export function ExtendSprintButton({ sprintId, sprints, release }: {
  sprintId: string
  sprints: SprintDates[]
  release: { release_on: string; go_no_go_on: string }
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [days, setDays] = useState(1)
  const [cascade, setCascade] = useState(true)
  const [reason, setReason] = useState('')
  const [pending, start] = useTransition()
  const plan = useMemo(() => planExtension(sprints, sprintId, Math.max(1, days || 1), cascade, release), [sprints, sprintId, days, cascade, release])
  const self = plan.sprints[0]
  const later = plan.sprints.slice(1)
  const releaseMoves = plan.release.release_on !== release.release_on

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn">Extend</button>
      <Dialog open={open} onClose={() => setOpen(false)} title={`Extend ${self.name}`}>
        <form className="space-y-3" onSubmit={(e) => {
          e.preventDefault()
          start(async () => {
            const res = await extendSprint({ sprint_id: sprintId, days, cascade, reason })
            if (res.error) toast(res.error, 'error')
            else { toast(res.summary ?? 'Extended'); setOpen(false); setReason(''); router.refresh() }
          })
        }}>
          <label className="block"><span className="label">Extra working days</span>
            <input type="number" min={1} max={15} required value={days} onChange={(e) => setDays(Number(e.target.value))} className="input mt-1 w-28" />
          </label>
          <label className="flex items-start gap-2 text-[13px]">
            <input type="checkbox" checked={cascade} onChange={(e) => setCascade(e.target.checked)} className="mt-0.5" />
            <span>Shift every later sprint by the same amount<span className="block text-[11.5px] text-[var(--muted)]">Untick to absorb the days instead (the next sprint overlaps or is shortened).</span></span>
          </label>
          <div className="border border-[var(--line-soft)] bg-[var(--surface-3)] p-3 text-[12.5px]">
            <div><b>{self.name}</b> now ends <b>{fmt(self.ends_on)}</b></div>
            {later.length > 0 && <div className="mt-1 text-[var(--ink-2)]">{later.length} later sprints move, from {later[0].name} to {later.at(-1)!.name}</div>}
            <div className={`mt-1 ${releaseMoves ? 'font-semibold text-[var(--crit)]' : 'text-[var(--good)]'}`}>
              {releaseMoves ? `Release moves from ${fmt(release.release_on)} to ${fmt(plan.release.release_on)}` : `Release stays ${fmt(release.release_on)}`}
            </div>
          </div>
          <label className="block"><span className="label">Why</span>
            <textarea required minLength={3} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Create flow blocked by the membership error for 2 days" className="input mt-1 w-full" />
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className="btn">Cancel</button>
            <button disabled={pending} className="btn btn-primary">{pending ? 'Saving…' : `Extend ${self.name}`}</button>
          </div>
        </form>
      </Dialog>
    </>
  )
}

type Check = { label: string; ok: boolean; detail: string }
type OpenTicket = { id: string; key: string; title: string; severity: string; state: string }

/**
 * Closing a sprint. With the gate met, open tickets simply move on. With it unmet, the lead says
 * why and decides the spillover: which tickets go to which sprint (the rest to no sprint, for
 * triage) and whether the unfinished areas are added there to make the work up.
 */
export function FinishSprintButton({ sprintId, sprintName, checks, tickets, laterSprints, unfinishedAreas }: {
  sprintId: string
  sprintName: string
  checks: Check[]
  tickets: OpenTicket[]
  laterSprints: { id: string; name: string }[]
  unfinishedAreas: string[]
}) {
  const router = useRouter()
  const ok = checks.every((c) => c.ok)
  const [open, setOpen] = useState(false)
  const [target, setTarget] = useState(laterSprints[0]?.id ?? '')
  const [picked, setPicked] = useState<Set<string>>(new Set(tickets.map((t) => t.id)))
  const [addAreas, setAddAreas] = useState(!ok && unfinishedAreas.length > 0)
  const [reason, setReason] = useState('')
  const [pending, start] = useTransition()
  const targetName = laterSprints.find((s) => s.id === target)?.name
  const parked = tickets.length - picked.size

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn btn-primary">Close sprint</button>
      <Dialog open={open} onClose={() => setOpen(false)} title={ok ? `Close ${sprintName}` : `Close ${sprintName} with spillover`} wide>
        <form className="space-y-4" onSubmit={(e) => {
          e.preventDefault()
          start(async () => {
            const res = await finishSprint({ sprint_id: sprintId, target_sprint_id: target || null, ticket_ids: [...picked], add_areas: addAreas, reason })
            if (res.error) toast(res.error, 'error')
            else { toast(res.summary ?? 'Sprint closed'); setOpen(false); router.refresh() }
          })
        }}>
          <ul className="space-y-1.5">
            {checks.map((c) => (
              <li key={c.label} className="flex items-start gap-2 text-[13px]">
                <span className={c.ok ? 'text-[var(--good)]' : 'text-[var(--crit)]'}>{c.ok ? '✓' : '✗'}</span>
                <span className="flex-1">{c.label}</span>
                <span className="text-[12px] text-[var(--muted)]">{c.detail}</span>
              </li>
            ))}
          </ul>

          {tickets.length > 0 && (
            <section className="border-t border-[var(--line)] pt-3">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="label">Open tickets · {picked.size} of {tickets.length} move to</h3>
                <select value={target} onChange={(e) => setTarget(e.target.value)} className="select" aria-label="Move tickets to sprint">
                  {laterSprints.length === 0 && <option value="">No later sprint</option>}
                  {laterSprints.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
                <button type="button" className="text-[12px] text-[var(--accent)] hover:underline" onClick={() => setPicked(new Set(tickets.map((t) => t.id)))}>All</button>
                <button type="button" className="text-[12px] text-[var(--accent)] hover:underline" onClick={() => setPicked(new Set())}>None</button>
              </div>
              <ul className="mt-2 max-h-56 divide-y divide-[var(--row)] overflow-auto border border-[var(--line-soft)]">
                {tickets.map((t) => (
                  <li key={t.id}>
                    <label className="flex cursor-pointer items-center gap-2 px-2.5 py-1.5 text-[12.5px] hover:bg-[var(--surface-3)]">
                      <input type="checkbox" checked={picked.has(t.id)} onChange={(e) => setPicked((p) => { const n = new Set(p); if (e.target.checked) n.add(t.id); else n.delete(t.id); return n })} />
                      <span className="mono text-[11.5px] text-[var(--accent)]">{t.key}</span>
                      <span className="min-w-0 flex-1 truncate">{t.title}</span>
                      <span className="text-[11.5px] text-[var(--muted)]">{t.severity} · {t.state}</span>
                    </label>
                  </li>
                ))}
              </ul>
              {parked > 0 && <p className="mt-1 text-[12px] text-[var(--muted)]">{parked} unticked {parked === 1 ? 'ticket goes' : 'tickets go'} to no sprint, to be triaged later.</p>}
            </section>
          )}

          {!ok && unfinishedAreas.length > 0 && targetName && (
            <label className="flex items-start gap-2 border-t border-[var(--line)] pt-3 text-[13px]">
              <input type="checkbox" checked={addAreas} onChange={(e) => setAddAreas(e.target.checked)} className="mt-0.5" />
              <span>Make up the unfinished work in {targetName}: add {unfinishedAreas.join(', ')} to it
                <span className="block text-[11.5px] text-[var(--muted)]">Their untested cases then show on {targetName}&apos;s board. To keep dates instead, use Extend.</span></span>
            </label>
          )}

          <label className="block border-t border-[var(--line)] pt-3"><span className="label">{ok ? 'Note (optional)' : 'Why close with the gate not met'}</span>
            <textarea required={!ok} minLength={ok ? 0 : 3} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} className="input mt-1 w-full"
              placeholder={ok ? '' : 'e.g. Remaining Create cases blocked on the Data MAIA deploy; making them up in S3'} />
          </label>
          <p className="text-[12px] text-[var(--muted)]">This is recorded in the schedule log with your name.</p>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className="btn">Cancel</button>
            <button disabled={pending || (picked.size > 0 && !target)} className="btn btn-primary">{pending ? 'Closing…' : `Close ${sprintName}`}</button>
          </div>
        </form>
      </Dialog>
    </>
  )
}
