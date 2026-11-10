'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from '@/components/toast'
import { decideProposals, setHold } from '@/app/(app)/asks/actions'

type Proposal = { id: string; tc_id: string; title: string; reason: string | null }

/** The runner's "not automatable" proposals; the lead approves or turns them down, one or all. */
export function ProposalsTable({ rows, isLead }: { rows: Proposal[]; isLead: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const decide = (ids: string[], approve: boolean) => start(async () => {
    const res = await decideProposals(ids, approve)
    if (res.error) toast(res.error, 'error')
    else { toast(`${ids.length} ${approve ? 'set to not automatable' : 'turned down'}`); router.refresh() }
  })
  if (!rows.length) return <p className="px-4 py-3 text-[12.5px] text-[var(--muted)]">Nothing proposed. The runner proposes with automation_proposed on PATCH /api/cases.</p>
  return (
    <>
      <table className="table w-full text-[12.5px]">
        <thead><tr><th>Case</th><th>Why not</th>{isLead && <th />}</tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td className="w-[40%]"><Link href={`/cases/${r.tc_id}`} className="mono font-medium text-[var(--accent)] hover:underline">{r.tc_id}</Link> {r.title}</td>
              <td>{r.reason}</td>
              {isLead && <td className="text-right whitespace-nowrap">
                <button type="button" disabled={pending} onClick={() => decide([r.id], true)} className="btn btn-sm btn-primary">Approve</button>
                <button type="button" disabled={pending} onClick={() => decide([r.id], false)} className="btn btn-sm ml-1">Turn down</button>
              </td>}
            </tr>
          ))}
        </tbody>
      </table>
      {isLead && rows.length > 1 && (
        <div className="border-t border-[var(--line)] px-4 py-2">
          <button type="button" disabled={pending} onClick={() => { if (window.confirm(`Set all ${rows.length} cases to not automatable?`)) decide(rows.map((r) => r.id), true) }} className="btn btn-sm">Approve all {rows.length}</button>
        </div>
      )}
    </>
  )
}

/** Hold a screen until a defect closes or a date passes. */
export function HoldForm({ pages }: { pages: { id: string; label: string }[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [area, setArea] = useState('')
  const [defect, setDefect] = useState('')
  const [until, setUntil] = useState('')
  const [reason, setReason] = useState('')
  return (
    <form className="flex flex-wrap items-end gap-2 border-t border-[var(--line)] px-4 py-3 text-[12.5px]" onSubmit={(e) => {
      e.preventDefault()
      start(async () => {
        const res = await setHold(area, { defect: defect.trim() || undefined, until: until || undefined, reason })
        if (res.error) toast(res.error, 'error')
        else { toast('Screen held'); setArea(''); setDefect(''); setUntil(''); setReason(''); router.refresh() }
      })
    }}>
      <label><span className="label">Page</span>
        <select required value={area} onChange={(e) => setArea(e.target.value)} className="select mt-1 block w-56"><option value="">Choose…</option>{pages.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}</select>
      </label>
      <label><span className="label">Until this defect closes</span><input value={defect} onChange={(e) => setDefect(e.target.value)} className="input mt-1 block w-32 mono" placeholder="DEV-219" /></label>
      <label><span className="label">or until</span><input type="date" value={until} onChange={(e) => setUntil(e.target.value)} className="input mt-1 block" /></label>
      <label className="min-w-48 flex-1"><span className="label">Reason</span><input value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} className="input mt-1 block w-full" /></label>
      <button disabled={pending} className="btn btn-primary">{pending ? 'Holding…' : 'Hold screen'}</button>
    </form>
  )
}

export function LiftHold({ areaId }: { areaId: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  return (
    <button type="button" disabled={pending} className="btn btn-sm" onClick={() => start(async () => {
      const res = await setHold(areaId, null)
      if (res.error) toast(res.error, 'error')
      else { toast('Hold lifted'); router.refresh() }
    })}>Lift</button>
  )
}

/** Approve or turn down one case's proposal, on the case's own page. */
export function ProposalButtons({ caseId }: { caseId: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const decide = (approve: boolean) => start(async () => {
    const res = await decideProposals([caseId], approve)
    if (res.error) toast(res.error, 'error')
    else { toast(approve ? 'Set to not automatable' : 'Turned down'); router.refresh() }
  })
  return (
    <div className="mt-1.5 flex gap-1">
      <button type="button" disabled={pending} onClick={() => decide(true)} className="btn btn-sm btn-primary">Approve</button>
      <button type="button" disabled={pending} onClick={() => decide(false)} className="btn btn-sm">Turn down</button>
    </div>
  )
}
