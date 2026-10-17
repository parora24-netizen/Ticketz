'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Dialog } from '@/components/dialog'
import { toast } from '@/components/toast'
import { recordCaseResult } from '@/app/(app)/actions'

type Result = 'passed' | 'failed' | 'blocked'

/** Pass records at once; Fail and Blocked ask what was seen (and Fail raises the ticket). */
export function CaseResultActions({ caseId, size = 'md' }: { caseId: string; size?: 'sm' | 'md' }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [ask, setAsk] = useState<Result | null>(null)
  const [note, setNote] = useState('')
  const [build, setBuild] = useState('')
  const [raise, setRaise] = useState(true)

  function save(result: Result, extra: { note?: string; build?: string; raise_ticket?: boolean } = {}) {
    start(async () => {
      const res = await recordCaseResult({ case_id: caseId, result, ...extra })
      if (res.error) toast(res.error, 'error')
      else {
        toast(result === 'passed' ? 'Pass recorded' : result === 'blocked' ? 'Blocked recorded' : res.ticketKey ? `Fail recorded · ticket ${res.ticketKey}` : 'Fail recorded')
        router.refresh()
      }
    })
  }
  const cls = size === 'sm' ? 'btn btn-sm' : 'btn'
  return (
    <>
      <button type="button" disabled={pending} onClick={() => save('passed')} className={`${cls} border-[var(--good-line)] text-[var(--good)] hover:border-[var(--good)] hover:text-[var(--good)]`}>✓ Pass</button>
      <button type="button" disabled={pending} onClick={() => { setNote(''); setAsk('failed') }} className={`${cls} border-[var(--crit-line)] text-[var(--crit)] hover:border-[var(--crit)] hover:text-[var(--crit)]`}>✕ Fail</button>
      <button type="button" disabled={pending} onClick={() => { setNote(''); setAsk('blocked') }} className={cls}>Blocked</button>
      <Dialog open={!!ask} onClose={() => setAsk(null)} title={ask === 'failed' ? 'Record a failure' : 'Record as blocked'}>
        {ask && (
          <form className="space-y-3" onSubmit={(e) => {
            e.preventDefault()
            save(ask, { note: note.trim() || undefined, build: build.trim() || undefined, raise_ticket: ask === 'failed' ? raise : undefined })
            setAsk(null)
          }}>
            <label className="block"><span className="label">{ask === 'failed' ? 'What happened' : 'What is blocking it'}</span>
              <textarea autoFocus required={ask === 'blocked'} rows={3} value={note} onChange={(e) => setNote(e.target.value)} className="input mt-1 w-full" />
            </label>
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
              <button className="btn btn-primary">{ask === 'failed' ? 'Record fail' : 'Record blocked'}</button>
            </div>
          </form>
        )}
      </Dialog>
    </>
  )
}
