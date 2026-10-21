'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Dialog } from '@/components/dialog'
import { toast } from '@/components/toast'
import { recordCaseResult, updateCases } from '@/app/(app)/actions'
import { EvidenceField, useEvidence } from '@/components/evidence'

type Result = 'passed' | 'failed' | 'blocked'

/**
 * Pass, Fail or Blocked, each with an optional comment and screenshots: pick files, drop them on
 * the box, or paste a screenshot (Ctrl+V). Files go straight to the private evidence bucket and
 * are kept with the result. A Fail raises a ticket unless one is open.
 */
export function CaseResultActions({ caseId, size = 'md', onDone }: { caseId: string; size?: 'sm' | 'md'; onDone?: () => void }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [ask, setAsk] = useState<Result | null>(null)
  const [note, setNote] = useState('')
  const [build, setBuild] = useState('')
  const [raise, setRaise] = useState(true)
  const ev = useEvidence(`runs/${caseId}`)

  function begin(result: Result) {
    setNote(''); setBuild(''); setRaise(true); ev.reset(); setAsk(result)
  }

  function save(result: Result) {
    start(async () => {
      const res = await recordCaseResult({
        case_id: caseId, result, note: note.trim() || undefined, build: build.trim() || undefined,
        raise_ticket: result === 'failed' ? raise : undefined, attachments: ev.paths,
      })
      if (res.error) toast(res.error, 'error')
      else {
        toast(result === 'passed' ? 'Pass recorded' : result === 'blocked' ? 'Blocked recorded' : res.ticketKey ? `Fail recorded · ticket ${res.ticketKey}` : 'Fail recorded')
        setAsk(null)
        router.refresh()
        onDone?.()
      }
    })
  }

  const cls = size === 'sm' ? 'btn btn-sm' : 'btn'
  const title = ask === 'passed' ? 'Record a pass' : ask === 'failed' ? 'Record a failure' : 'Record as blocked'
  return (
    <>
      <button type="button" disabled={pending} onClick={() => begin('passed')} className={`${cls} border-[var(--good-line)] text-[var(--good)] hover:border-[var(--good)] hover:text-[var(--good)]`}>✓ Pass</button>
      <button type="button" disabled={pending} onClick={() => begin('failed')} className={`${cls} border-[var(--crit-line)] text-[var(--crit)] hover:border-[var(--crit)] hover:text-[var(--crit)]`}>✕ Fail</button>
      <button type="button" disabled={pending} onClick={() => begin('blocked')} className={cls}>Blocked</button>
      <Dialog open={!!ask} onClose={() => setAsk(null)} title={title}>
        {ask && (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save(ask) }}
            onPaste={ev.onPaste}>
            <label className="block"><span className="label">{ask === 'failed' ? 'What happened' : ask === 'blocked' ? 'What is blocking it' : 'Comment (optional)'}</span>
              <textarea autoFocus required={ask === 'blocked'} rows={3} value={note} onChange={(e) => setNote(e.target.value)} className="input mt-1 w-full" />
            </label>
            <EvidenceField ev={ev} />
            {ask === 'failed' && (
              <>
                <label className="block"><span className="label">Build tested</span>
                  <input value={build} onChange={(e) => setBuild(e.target.value)} placeholder="Optional" className="input mono mt-1 w-full" />
                </label>
                <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={raise} onChange={(e) => setRaise(e.target.checked)} />Raise a ticket (skipped if one is already open)</label>
              </>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setAsk(null)} className="btn">Cancel</button>
              <button disabled={pending || ev.uploading > 0} className="btn btn-primary">
                {ev.uploading > 0 ? 'Uploading…' : pending ? 'Saving…' : ask === 'passed' ? 'Record pass' : ask === 'failed' ? 'Record fail' : 'Record blocked'}
              </button>
            </div>
          </form>
        )}
      </Dialog>
    </>
  )
}

/** Who tests the case, in the side panel: change and it saves. */
export function CaseTesterField({ caseId, value, people, disabled, onDone }: {
  caseId: string; value: string | null; people: { id: string; name: string }[]; disabled?: boolean; onDone?: () => void
}) {
  const router = useRouter()
  const [v, setV] = useState(value ?? '')
  const [pending, start] = useTransition()
  return (
    <select value={v} disabled={disabled || pending} aria-label="Tester" className="select w-full"
      onChange={(e) => {
        const next = e.target.value
        const before = v
        setV(next)
        start(async () => {
          const res = await updateCases([caseId], { tester_id: next || null })
          if (res.error) { setV(before); toast(res.error, 'error') }
          else { toast('Tester saved'); router.refresh(); onDone?.() }
        })
      }}>
      <option value="">No tester</option>
      {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
    </select>
  )
}

/** Automation status in the case's side panel: change and it saves. */
export function CaseAutomationField({ caseId, value, disabled, onDone }: { caseId: string; value: string; disabled?: boolean; onDone?: () => void }) {
  const router = useRouter()
  const [v, setV] = useState(value)
  const [pending, start] = useTransition()
  return (
    <select value={v} disabled={disabled || pending} aria-label="Automation" className="select w-full"
      onChange={(e) => {
        const next = e.target.value as 'not_automated' | 'automated' | 'manual_only'
        const before = v
        setV(next)
        start(async () => {
          const res = await updateCases([caseId], { automation: next })
          if (res.error) { setV(before); toast(res.error, 'error') }
          else { toast('Automation saved'); router.refresh(); onDone?.() }
        })
      }}>
      <option value="not_automated">Not automated yet</option>
      <option value="automated">Automated</option>
      <option value="manual_only">Manual only</option>
    </select>
  )
}
