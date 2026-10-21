'use client'

import Link from 'next/link'
import { useState } from 'react'
import { EvidenceField, useEvidence } from '@/components/evidence'
import { SubmitButton } from '@/components/submit-button'
import { raiseTicket } from '../../actions'

/**
 * A ticket raised on its own, not from a test case: where it happens, how bad, what is wrong,
 * and screenshots. Always a product defect; "the test is wrong" is raised from the case.
 */
export function NewTicketForm({ areas }: { areas: { id: string; zone: string; page: string }[] }) {
  // Screenshots go up before the ticket exists, so they sit under a folder named for this form.
  const [draft] = useState(() => crypto.randomUUID())
  const ev = useEvidence(`tickets/${draft}`)
  const zones = [...new Set(areas.map((a) => a.zone))]
  const [zone, setZone] = useState('')

  return (
    <form action={raiseTicket} onPaste={ev.onPaste} className="card grid max-w-3xl gap-4 p-5 sm:grid-cols-4">
      <input type="hidden" name="back" value="/tickets/new" />
      {ev.paths.map((p) => <input key={p} type="hidden" name="attachments" value={p} />)}
      <label className="sm:col-span-4">
        <span className="label">Title</span>
        <input name="title" required minLength={3} placeholder="What is wrong" className="input mt-1 w-full" />
      </label>
      <label className="sm:col-span-2">
        <span className="label">Zone</span>
        <select required value={zone} onChange={(e) => setZone(e.target.value)} className="select mt-1 w-full">
          <option value="" disabled>Pick a zone</option>
          {zones.map((z) => <option key={z}>{z}</option>)}
        </select>
      </label>
      <label className="sm:col-span-2">
        <span className="label">Page</span>
        <select key={zone} name="area_id" required defaultValue="" disabled={!zone} className="select mt-1 w-full">
          <option value="" disabled>{zone ? 'Pick a page' : 'Pick a zone first'}</option>
          {areas.filter((a) => a.zone === zone).map((a) => <option key={a.id} value={a.id}>{a.page}</option>)}
        </select>
      </label>
      <label className="sm:col-span-2">
        <span className="label">Severity</span>
        <select name="severity" defaultValue="High" className="select mt-1 w-full">
          {['Critical', 'High', 'Medium', 'Low'].map((p) => <option key={p}>{p}</option>)}
        </select>
      </label>
      <label className="sm:col-span-4">
        <span className="label">Description</span>
        <textarea name="description" rows={6} placeholder={'Which build, steps to reproduce, what you expected and what happened'} className="input mt-1 w-full" />
      </label>
      <div className="sm:col-span-4">
        <EvidenceField ev={ev} />
      </div>
      <div className="flex gap-2 sm:col-span-4">
        <SubmitButton primary pendingText="Raising…" disabled={ev.uploading > 0}>{ev.uploading > 0 ? 'Uploading…' : 'Raise ticket'}</SubmitButton>
        <Link href="/tickets" className="btn">Cancel</Link>
      </div>
    </form>
  )
}
