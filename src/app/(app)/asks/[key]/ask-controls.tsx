'use client'

import Link from '@/components/link'
import { useRouter } from 'next/navigation'
import { useRef, useState, useTransition } from 'react'
import { MentionTextarea } from '@/components/mentions'
import { toast } from '@/components/toast'
import { OUTCOME_LABEL, type AskKind, type Outcome } from '@/lib/automation-loop'
import { changeAsk, commentAsk } from '../actions'

type Patch = Parameters<typeof changeAsk>[1]
type Choice = Outcome | 'suite'
export type AskCase = { tc_id: string; title: string; edited: boolean; out: string | null }

/** Saves a change to the ask and says what it did. */
function useSave(askKey: string) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const save = (patch: Patch, done: string, after?: () => void) => start(async () => {
    const res = await changeAsk(askKey, patch)
    if (res.error) toast(res.error, 'error')
    else { toast(res.effect ? `${done}. ${res.effect}.` : done); after?.(); router.refresh() }
  })
  return { pending, save }
}

/**
 * What the owner can do with an open ask. Most asks end with the cases edited; the rest defer,
 * retire or keep the cases for testing by hand, hand the ask to the suite's owner, record access
 * given, answer in words, or point to the ask that covers it.
 */
export function AskActions({ askKey, kind, cases, suiteOwner, suiteNeed }: { askKey: string; kind: AskKind; cases: AskCase[]; suiteOwner: string | null; suiteNeed: string | null }) {
  const { pending, save } = useSave(askKey)
  const [choice, setChoice] = useState<Choice | null>(null)
  const [text, setText] = useState('')
  const [store, setStore] = useState('')
  const [dup, setDup] = useState('')
  const live = cases.filter((c) => !c.out)
  const edited = live.filter((c) => c.edited).length
  const n = (k: number) => `${k} case${k === 1 ? '' : 's'}`
  const CHOICES: { id: Choice; label: string; hint: string }[] = [
    { id: 'edited', label: 'Edit the cases', hint: 'Fix what the cases say. Usually the answer.' },
    { id: 'deferred', label: 'Defer the cases', hint: 'Not for now. Their open tickets are deferred too.' },
    { id: 'retired', label: 'Retire the cases', hint: 'Take them out of the suite for good.' },
    { id: 'manual', label: 'Manual only', hint: 'Keep them, tested by hand and never by the runner.' },
    ...(!suiteNeed ? [{ id: 'suite' as const, label: 'The suite can’t do this', hint: `Hand it to ${suiteOwner ?? 'the suite’s owner'} to add what the suite is missing.` }] : []),
    { id: 'access', label: 'Access given', hint: 'A login, server or mailbox is now set up.' },
    { id: 'answered', label: 'Answer', hint: 'Reply in words; nothing else changes.' },
    { id: 'duplicate', label: 'Duplicate', hint: 'Another ask already covers it.' },
  ]
  // A need is usually settled by access.
  if (kind === 'need') CHOICES.unshift(...CHOICES.splice(CHOICES.findIndex((c) => c.id === 'access'), 1))
  const pick = (c: Choice) => { setChoice(choice === c ? null : c); setText('') }
  const close = (state: Outcome, extra: Patch = {}) => save({ state, answer: text.trim() || undefined, ...extra }, `Closed: ${OUTCOME_LABEL[state]}`, () => setChoice(null))
  const note = (label: string, required: boolean, placeholder?: string) => (
    <label className="block"><span className="label">{label}{required ? '' : ' (optional)'}</span>
      <textarea required={required} value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={5000} placeholder={placeholder} className="input mt-1 w-full" />
    </label>
  )
  return (
    <section className="card p-5">
      <h2 className="text-[14px] font-semibold">What will you do?</h2>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {CHOICES.map((c) => (
          <button key={c.id} type="button" onClick={() => pick(c.id)} aria-pressed={choice === c.id}
            className={`border px-3 py-2 text-left transition-colors ${choice === c.id ? 'border-[var(--navy)] bg-[var(--accent-soft)]' : 'border-[var(--line)] hover:border-[var(--navy)]'}`}>
            <span className="block text-[13px] font-semibold text-[var(--navy-ink)]">{c.label}</span>
            <span className="mt-0.5 block text-[11.5px] leading-snug text-[var(--muted)]">{c.hint}</span>
          </button>
        ))}
      </div>

      {choice && (
        <form className="mt-4 space-y-3 border-t border-[var(--line)] pt-4 text-[13px]" onSubmit={(e) => {
          e.preventDefault()
          if (choice === 'edited') {
            if (!edited && !window.confirm('None of its cases has been edited since this ask was raised. Close it as edited anyway?')) return
            close('edited')
          } else if (choice === 'retired') {
            if (window.confirm(`Retire ${n(live.length)}? They leave the suite and their open tickets are deferred.`)) close('retired')
          } else if (choice === 'deferred') close('deferred')
          else if (choice === 'manual') close('manual')
          else if (choice === 'access') close('access', store.trim() ? { store: store.trim() } : {})
          else if (choice === 'answered') close('answered')
          else if (choice === 'duplicate') close('duplicate', { duplicate_of: dup.trim() })
          else if (choice === 'suite') save({ suite: text.trim() }, `Handed to ${suiteOwner ?? 'the suite’s owner'} for a suite change`, () => setChoice(null))
        }}>
          {choice === 'edited' && (
            <>
              <p className="text-[var(--muted)]">Open each case, fix what it says and save. When every case is edited this ask closes by itself; close it here if only some needed a change.</p>
              {live.length > 0 ? (
                <ul className="divide-y divide-[var(--row)] border border-[var(--line-soft)]">
                  {live.map((c) => (
                    <li key={c.tc_id} className="flex items-center gap-3 px-3 py-1.5">
                      <Link href={`/cases/${encodeURIComponent(c.tc_id)}`} className="mono shrink-0 text-[12px] font-medium text-[var(--accent)] hover:underline">{c.tc_id}</Link>
                      <span className="min-w-0 flex-1 truncate text-[12.5px]" title={c.title}>{c.title}</span>
                      <span className={`shrink-0 text-[12px] ${c.edited ? 'font-medium text-[var(--good)]' : 'text-[var(--faint)]'}`}>{c.edited ? 'Edited' : 'Not yet'}</span>
                    </li>
                  ))}
                </ul>
              ) : <p className="text-[var(--muted)]">It has no cases in the suite.</p>}
              {live.length > 0 && <p className="text-[12px] text-[var(--muted)]">{edited} of {n(live.length)} edited since it was raised.</p>}
              {note('What you changed', false)}
            </>
          )}
          {(choice === 'deferred' || choice === 'retired') && (
            <>
              <p className="text-[var(--muted)]">{live.length ? `${n(live.length)} will be ${choice}` : 'It has no cases in the suite'}{live.length ? '; their open tickets are deferred with them.' : '.'} {choice === 'deferred' ? 'They can be brought back later.' : ''}</p>
              {note(`Why ${choice === 'deferred' ? 'defer them' : 'retire them'}`, true)}
            </>
          )}
          {choice === 'manual' && (
            <>
              <p className="text-[var(--muted)]">{n(live.length)} stay in the suite, tested by hand only. The runner stops trying them.</p>
              {note('Why they cannot be automated', false)}
            </>
          )}
          {choice === 'suite' && (
            <>
              <p className="text-[var(--muted)]">The cases are right, but the e2e suite cannot do this yet. The ask goes to {suiteOwner ?? 'the suite’s owner'} and stays open until the suite can.</p>
              {note('What the suite needs to be able to do', true, 'e.g. edit or delete a saved record')}
            </>
          )}
          {choice === 'access' && (
            <>
              <label className="block"><span className="label">Where it is stored (only for a login or secret)</span>
                <input value={store} onChange={(e) => setStore(e.target.value)} className="input mono mt-1 w-full" placeholder="e.g. /e2e/mssql/password (the parameter's name, never the secret)" />
              </label>
              {note('What was set up', false, 'e.g. server, port and database name; never a password')}
            </>
          )}
          {choice === 'answered' && note('Answer', true)}
          {choice === 'duplicate' && (
            <>
              <label className="block"><span className="label">The ask that covers it</span>
                <input required value={dup} onChange={(e) => setDup(e.target.value)} pattern="[Aa][Ss][Kk]-\d+" className="input mono mt-1 w-40" placeholder="ASK-12" />
              </label>
              <p className="text-[12px] text-[var(--muted)]">{n(cases.length)} move onto that ask.</p>
            </>
          )}
          <div className="flex gap-2">
            <button disabled={pending} className="btn btn-primary">
              {pending ? 'Saving…' : choice === 'suite' ? `Hand to ${suiteOwner ?? 'the suite’s owner'}` : `Close: ${OUTCOME_LABEL[choice]}`}
            </button>
            <button type="button" disabled={pending} onClick={() => setChoice(null)} className="btn">Cancel</button>
          </div>
        </form>
      )}
    </section>
  )
}

/** The suite's owner closes an ask once the suite can do what it needed. */
export function SuiteDone({ askKey, need }: { askKey: string; need: string }) {
  const { pending, save } = useSave(askKey)
  return (
    <button type="button" disabled={pending} className="btn btn-sm"
      onClick={() => { if (window.confirm('Close it: the suite can do this now, so the runner tries its cases again?')) save({ state: 'answered', answer: `The suite can now: ${need}` }, 'Closed: the suite can do it') }}>
      The suite can do it now
    </button>
  )
}

export function AskReopen({ askKey }: { askKey: string }) {
  const { pending, save } = useSave(askKey)
  return <button type="button" disabled={pending} onClick={() => save({ state: 'open' }, 'Reopened')} className="btn btn-sm">Reopen</button>
}

/** Owner and due date, changed in place while the ask is open. */
export function AskOwnerDue({ askKey, owner, due, people, canEdit }: { askKey: string; owner: string | null; due: string | null; people: string[]; canEdit: boolean }) {
  const { pending, save } = useSave(askKey)
  return (
    <>
      <div className="px-4 py-2.5"><dt className="label mb-1">Owner</dt><dd>
        <select disabled={!canEdit || pending} key={owner ?? ''} defaultValue={owner ?? ''} aria-label="Owner" className="select w-full"
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

export type AskComment = { id: string; who: string; at: string; body: string }

/** A comment's text with each @Name picked out. */
function Body({ text, people }: { text: string; people: string[] }) {
  const names = [...people].sort((a, b) => b.length - a.length).map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
  if (!names.length) return <>{text}</>
  const parts = text.split(new RegExp(`(@(?:${names.join('|')}))(?![\\w])`, 'gi'))
  return <>{parts.map((p, i) => (i % 2 ? <b key={i} className="font-semibold text-[var(--accent)]">{p}</b> : p))}</>
}

/**
 * The ask's thread. Tag someone with @Name to ask them (they are told and emailed); tick the box to
 * hand them the ask until they reply, when it comes back on its own.
 */
export function AskDiscussion({ askKey, comments, people, open, me, owner, handedFrom }: {
  askKey: string; comments: AskComment[]; people: string[]; open: boolean; me: string; owner: string | null; handedFrom: string | null
}) {
  const router = useRouter()
  const form = useRef<HTMLFormElement>(null)
  const [hand, setHand] = useState(false)
  const [pending, start] = useTransition()
  const handingBack = open && !!handedFrom && owner === me
  return (
    <section id="comments" className="card p-5">
      <h2 className="text-[14px] font-semibold">Discussion</h2>
      <p className="mt-0.5 text-[12px] text-[var(--muted)]">Type @ to tag someone: they get a notification and an email.</p>
      {comments.length > 0 && (
        <ol className="mt-3 space-y-3">
          {comments.map((c) => (
            <li key={c.id} className="border-l-2 border-[var(--line)] pl-3 text-[13px]">
              <p className="text-[12px] text-[var(--muted)]"><b className="font-semibold text-[var(--ink)]">{c.who}</b> · {c.at}</p>
              <p className="mt-0.5 whitespace-pre-wrap text-[var(--ink-2)]"><Body text={c.body} people={people} /></p>
            </li>
          ))}
        </ol>
      )}
      <form ref={form} className="mt-4 space-y-2" onSubmit={(e) => {
        e.preventDefault()
        const body = String(new FormData(e.currentTarget).get('body') ?? '').trim()
        if (!body) return
        start(async () => {
          const res = await commentAsk(askKey, body, hand)
          if (res.error) { toast(res.error, 'error'); return }
          toast(res.effect ? `Posted. ${res.effect}.` : 'Posted')
          form.current?.reset()
          setHand(false)
          router.refresh()
        })
      }}>
        <MentionTextarea people={people} name="body" required rows={3} maxLength={5000} className="input w-full"
          placeholder={handingBack ? `Reply to ${handedFrom}…` : 'Ask a question, tag someone with @…'} />
        <div className="flex flex-wrap items-center gap-3">
          <button disabled={pending} className="btn btn-primary btn-sm">{pending ? 'Posting…' : 'Post'}</button>
          {open && !handingBack && (
            <label className="flex items-center gap-1.5 text-[12.5px]">
              <input type="checkbox" checked={hand} onChange={(e) => setHand(e.target.checked)} />
              Hand it to the person I tag until they reply
            </label>
          )}
          {handingBack && <span className="text-[12.5px] text-[var(--muted)]">Your reply hands it back to {handedFrom}.</span>}
        </div>
      </form>
    </section>
  )
}
