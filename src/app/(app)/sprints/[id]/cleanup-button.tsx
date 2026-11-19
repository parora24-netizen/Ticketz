'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState, useTransition } from 'react'
import { Dialog } from '@/components/dialog'
import { toast } from '@/components/toast'
import { planSize, type CleanupPlan } from '@/lib/workflow/cleanup'
import { applyCleanup, previewCleanup } from './cleanup-actions'

const NONE = '__none'

/** The lead's Clean up: see what the sprint's clean-up rules would change, then apply them. */
export function CleanupButton({ sprintId, sprintName, people }: { sprintId: string; sprintName: string; people: { id: string; name: string }[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [owner, setOwner] = useState<string | undefined>(undefined) // undefined: the suggested person
  const [tester, setTester] = useState<string | undefined>(undefined)
  const [plan, setPlan] = useState<CleanupPlan | null>(null)
  const [loading, startLoad] = useTransition()
  const [applying, startApply] = useTransition()
  const nameOf = (id: string | null | undefined) => people.find((p) => p.id === id)?.name ?? 'nobody'
  const asChoice = (v: string | undefined) => (v === undefined ? undefined : v === NONE ? null : v)

  useEffect(() => {
    if (!open) return
    startLoad(async () => {
      const res = await previewCleanup({ sprint_id: sprintId, automation_owner: asChoice(owner), tester: asChoice(tester) })
      if (res.error) { toast(res.error, 'error'); return }
      setPlan(res.plan!)
      if (owner === undefined) setOwner(res.automationOwner ?? NONE)
      if (tester === undefined) setTester(res.tester ?? NONE)
    })
  }, [open, owner, tester, sprintId])

  const sections: { title: string; why: string; keys: string[] }[] = plan ? [
    { title: 'Close', why: 'Passes by hand and in automation', keys: plan.close.map((s) => s.key) },
    { title: 'Mark duplicate', why: 'A bug that passes by hand, with an open test issue on the same case', keys: plan.duplicate.map((s) => `${s.key} → ${s.of_key}`) },
    { title: `Give to ${nameOf(asChoice(owner))}`, why: 'Passes by hand, fails in automation: automation fixes their side', keys: plan.toAutomation.map((s) => s.key) },
    { title: 'Give to the tester', why: 'Fails by hand, passes in automation: the tester takes a look', keys: plan.toTester.map((s) => `${s.key} (${nameOf(s.tester_id)})`) },
    { title: `Make ${nameOf(asChoice(tester))} the tester`, why: 'Test cases with nobody to test them', keys: plan.tester.map((t) => t.tc_id) },
  ] : []

  return (
    <>
      <button type="button" className="btn" onClick={() => { setPlan(null); setOwner(undefined); setTester(undefined); setOpen(true) }}>Clean up</button>
      <Dialog open={open} onClose={() => setOpen(false)} title={`Clean up ${sprintName}`} wide>
        <div className="space-y-4 text-[13px]">
          <p className="text-[var(--muted)]">Applies the team&apos;s rules to this sprint&apos;s open tickets, using each test case&apos;s latest manual and automated results. Every change gets a comment from you.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block"><span className="label">Automation fixes go to</span>
              <select id="cleanup-owner" className="select mt-1 w-full" value={owner ?? ''} onChange={(e) => setOwner(e.target.value)} disabled={loading || owner === undefined}>
                <option value={NONE}>Nobody (skip this rule)</option>
                {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
            <label className="block"><span className="label">Tester for cases with none</span>
              <select id="cleanup-tester" className="select mt-1 w-full" value={tester ?? ''} onChange={(e) => setTester(e.target.value)} disabled={loading || tester === undefined}>
                <option value={NONE}>Nobody (skip this rule)</option>
                {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
          </div>
          {!plan ? <p className="text-[var(--muted)]">Working out the changes…</p> : (
            <>
              <ul className="space-y-3">
                {sections.map((s) => (
                  <li key={s.title} className="border border-[var(--line)] p-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <b className="text-[var(--navy-ink)]">{s.title}</b>
                      <span className="mono text-[12px] text-[var(--muted)]">{s.keys.length}</span>
                    </div>
                    <p className="text-[12px] text-[var(--muted)]">{s.why}</p>
                    {s.keys.length > 0 && <p className="mono mt-1.5 text-[11.5px] break-words text-[var(--ink-2)]">{s.keys.join(', ')}</p>}
                  </li>
                ))}
              </ul>
              <div className="flex items-center justify-end gap-2">
                <button type="button" className="btn" onClick={() => setOpen(false)}>Cancel</button>
                <button type="button" className="btn btn-primary" disabled={applying || loading || planSize(plan) === 0}
                  onClick={() => startApply(async () => {
                    const res = await applyCleanup({ sprint_id: sprintId, automation_owner: asChoice(owner) ?? null, tester: asChoice(tester) ?? null })
                    if (res.error) toast(res.error, 'error')
                    else { toast(res.summary ?? 'Cleaned up'); setOpen(false); router.refresh() }
                  })}>
                  {applying ? 'Applying…' : planSize(plan) === 0 ? 'Nothing to clean up' : `Apply ${planSize(plan)} change${planSize(plan) === 1 ? '' : 's'}`}
                </button>
              </div>
            </>
          )}
        </div>
      </Dialog>
    </>
  )
}
