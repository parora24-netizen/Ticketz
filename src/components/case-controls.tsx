'use client'

import type { Automation } from '@/lib/workflow/case-stage'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Dialog } from '@/components/dialog'
import { toast } from '@/components/toast'
import { recordCaseResult, retireCases, undoResult, updateCases } from '@/app/(app)/actions'
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
        const next = e.target.value as Automation
        const before = v
        setV(next)
        start(async () => {
          const res = await updateCases([caseId], { automation: next })
          if (res.error) { setV(before); toast(res.error, 'error') }
          else { toast('Automation saved'); router.refresh(); onDone?.() }
        })
      }}>
      <option value="not_automated">Not automated yet</option>
      <option value="in_progress">In progress</option>
      <option value="blocked">Blocked</option>
      <option value="automated">Automated</option>
      <option value="manual_only">Manual only</option>
    </select>
  )
}

/** Undo on a case's latest manual result, after a confirm: for a result recorded by mistake. */
export function UndoResultButton({ runId, back, result }: { runId: string; back: string; result: string }) {
  return (
    <form action={undoResult} onSubmit={(e) => {
      if (!window.confirm(`Undo this ${result} result? The case goes back to its previous manual result, or to not tested. Any ticket it raised stays open.`)) e.preventDefault()
    }}>
      <input type="hidden" name="run_id" value={runId} />
      <input type="hidden" name="back" value={back} />
      <button className="text-[12px] text-[var(--accent)] hover:underline">Undo</button>
    </form>
  )
}

/** Take a case out of the release, retired for good or deferred to a later release (asks why), or bring it back. */
export function RetireCaseButton({ caseId, retired }: { caseId: string; retired: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [asking, setAsking] = useState<'retired' | 'deferred' | null>(null)
  const [why, setWhy] = useState('')
  const run = (reason: string | null, as: 'retired' | 'deferred' = 'retired') => start(async () => {
    const res = await retireCases([caseId], reason, as)
    if (res.error) toast(res.error, 'error')
    else { toast(reason === null ? 'Case restored' : as === 'deferred' ? 'Case deferred' : 'Case retired'); setAsking(null); router.refresh() }
  })
  if (retired) return <button type="button" className="btn" disabled={pending} onClick={() => run(null)}>{pending ? 'Restoring…' : 'Restore case'}</button>
  const deferring = asking === 'deferred'
  return (
    <>
      <button type="button" className="btn" disabled={pending} onClick={() => { setWhy(''); setAsking('deferred') }}>Defer</button>
      <button type="button" className="btn" disabled={pending} onClick={() => { setWhy(''); setAsking('retired') }}>Retire</button>
      <Dialog open={!!asking} onClose={() => setAsking(null)} title={deferring ? 'Defer this case to a later release' : 'Retire this case'}>
        <p className="text-[12.5px] text-[var(--muted)]">{deferring
          ? 'It leaves this release: every list, board and count, and the runner stops running it. It keeps its text and history, and is listed under Retired & deferred until someone restores it.'
          : 'For a case that no longer applies. It keeps its text and history but leaves every list, board and count, and the runner stops running it. You can restore it from this page.'}</p>
        <label className="mt-3 block"><span className="label">Why</span>
          <textarea className="input mt-1 w-full" rows={3} value={why} onChange={(e) => setWhy(e.target.value)} placeholder={deferring ? 'Single sign-on ships after 26.111' : 'Security questions are removed from the product'} autoFocus />
        </label>
        <div className="mt-3 flex justify-end gap-2">
          <button type="button" className="btn" onClick={() => setAsking(null)}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={pending || why.trim().length < 3} onClick={() => run(why, asking ?? 'retired')}>{pending ? 'Saving…' : deferring ? 'Defer case' : 'Retire case'}</button>
        </div>
      </Dialog>
    </>
  )
}
