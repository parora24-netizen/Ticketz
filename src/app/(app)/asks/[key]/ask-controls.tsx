'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from '@/components/toast'
import { DONE_WORD, OUTCOMES, type AskKind } from '@/lib/automation-loop'
import { changeAsk } from '../actions'

const VERB: Record<AskKind, string> = { need: 'Mark provided', question: 'Answer', decision: 'Decide' }
const OUTCOME_LABEL: Record<(typeof OUTCOMES)[number], string> = {
  retire: 'Retire the cases (not automatable)', rewrite: 'Rewrite the cases (their page writer is asked)', restore: 'Restore the control (opens a defect)', other: 'Something else',
}

/** Answer a question, provide a need (saying where it is stored, never the secret), or decide. */
export function AskAnswer({ askKey, kind, state, options }: { askKey: string; kind: AskKind; state: string; options: string[] }) {
  const router = useRouter()
  const [answer, setAnswer] = useState('')
  const [store, setStore] = useState('')
  const [outcome, setOutcome] = useState<(typeof OUTCOMES)[number] | ''>('')
  const [pending, start] = useTransition()
  const run = (patch: Parameters<typeof changeAsk>[1], done: string) => start(async () => {
    const res = await changeAsk(askKey, patch)
    if (res.error) toast(res.error, 'error')
    else { toast(res.effect ? `${done}. ${res.effect}.` : done); router.refresh() }
  })
  if (state !== 'open') {
    return <button type="button" disabled={pending} onClick={() => run({ state: 'open' }, 'Reopened')} className="btn btn-sm">Reopen</button>
  }
  return (
    <form className="space-y-3 border-t border-[var(--line)] pt-4" onSubmit={(e) => {
      e.preventDefault()
      run({ state: 'done', answer: answer || undefined, ...(kind === 'need' && store ? { store } : {}), ...(kind === 'decision' && outcome ? { outcome } : {}) }, DONE_WORD[kind][0].toUpperCase() + DONE_WORD[kind].slice(1))
    }}>
      {kind === 'decision' && (
        <label className="block"><span className="label">Outcome</span>
          <select required value={outcome} onChange={(e) => setOutcome(e.target.value as typeof outcome)} className="select mt-1 w-full">
            <option value="">Choose…</option>
            {OUTCOMES.map((o) => <option key={o} value={o}>{OUTCOME_LABEL[o]}</option>)}
          </select>
          {options.length > 0 && <span className="mt-1 block text-[12px] text-[var(--muted)]">Asked: {options.join(' · ')}</span>}
        </label>
      )}
      {kind === 'need' && (
        <label className="block"><span className="label">Where it is stored</span>
          <input value={store} onChange={(e) => setStore(e.target.value)} className="input mt-1 w-full mono" placeholder="e.g. /e2e/mssql/password (the parameter's name, never the secret)" />
        </label>
      )}
      <label className="block"><span className="label">{kind === 'question' ? 'Answer' : 'Note'}</span>
        <textarea required={kind === 'question'} value={answer} onChange={(e) => setAnswer(e.target.value)} rows={3} maxLength={5000} className="input mt-1 w-full" />
      </label>
      <div className="flex gap-2">
        <button disabled={pending} className="btn btn-primary">{pending ? 'Saving…' : VERB[kind]}</button>
        <button type="button" disabled={pending} onClick={() => { if (window.confirm('Decline this ask?')) run({ state: 'declined', answer: answer || undefined }, 'Declined') }} className="btn">Decline</button>
      </div>
    </form>
  )
}

/** Owner and due date, changed in place while the ask is open. */
export function AskOwnerDue({ askKey, owner, due, people, canEdit }: { askKey: string; owner: string | null; due: string | null; people: string[]; canEdit: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const save = (patch: Parameters<typeof changeAsk>[1], done: string) => start(async () => {
    const res = await changeAsk(askKey, patch)
    if (res.error) toast(res.error, 'error')
    else { toast(done); router.refresh() }
  })
  return (
    <>
      <div className="px-4 py-2.5"><dt className="label mb-1">Owner</dt><dd>
        <select disabled={!canEdit || pending} defaultValue={owner ?? ''} aria-label="Owner" className="select w-full"
          onChange={(e) => save({ owner: e.target.value || null }, 'Owner saved')}>
          <option value="">No one</option>
          {people.map((p) => <option key={p} value={p}>{p}</option>)}
        </select>
      </dd></div>
      <div className="px-4 py-2.5"><dt className="label mb-1">Due</dt><dd>
        <input type="date" disabled={!canEdit || pending} defaultValue={due ?? ''} aria-label="Due" className="input w-full"
          onChange={(e) => save({ due_on: e.target.value || null }, 'Due date saved')} />
      </dd></div>
    </>
  )
}
