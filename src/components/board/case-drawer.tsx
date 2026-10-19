'use client'

import Link from 'next/link'
import { useCallback, useEffect, useState, useTransition } from 'react'
import { CaseAutomationField, CaseResultActions, CaseTesterField } from '@/components/case-controls'
import { TicketActions, TicketField } from '@/components/ticket-controls'
import { toast } from '@/components/toast'
import { PriorityChip, ResultChip, StateChip } from '@/components/ui'
import type { RunResult } from '@/lib/workflow/case-stage'
import { allowedMoves, type Role, type TicketState } from '@/lib/workflow/ticket-machine'
import { addTicketComment, getCaseDetail, type CaseDetail } from '@/app/(app)/actions'

const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })

/** Work on one case, and its open ticket, without leaving the board. Esc or the backdrop closes it. */
export function CaseDrawer({ caseId, ticketId = null, onClose, role, people, sprints, active = true }: {
  caseId: string | null
  /** Show this ticket of the case (any state); otherwise its latest open one. */
  ticketId?: string | null
  /** Results only count toward a running sprint, so the panel records them only then. */
  active?: boolean
  onClose: () => void
  role: Role
  people: { id: string; name: string }[]
  sprints: { id: string; name: string }[]
}) {
  const [data, setData] = useState<CaseDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [comment, setComment] = useState('')
  const [posting, startPost] = useTransition()

  const load = useCallback(async (id: string) => {
    const res = await getCaseDetail(id, ticketId)
    if ('error' in res) setError(res.error)
    else { setError(null); setData(res) }
  }, [ticketId])

  useEffect(() => {
    setData(null)
    setComment('')
    if (caseId) void load(caseId)
  }, [caseId, load])

  useEffect(() => {
    if (!caseId) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !(e.target as HTMLElement).closest('dialog')) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [caseId, onClose])

  if (!caseId) return null
  const reload = () => caseId && load(caseId)
  const tester = role !== 'dev'
  const c = data?.case
  const t = data?.ticket

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <button type="button" aria-label="Close panel" onClick={onClose} className="absolute inset-0 bg-[rgba(15,27,51,.25)]" />
      <aside role="dialog" aria-modal="true" aria-label={c ? `${c.tc_id} ${c.title}` : 'Test case'}
        className="relative flex h-full w-[min(560px,100vw)] flex-col border-l border-[var(--line)] bg-white shadow-[-18px_0_44px_rgba(9,17,38,.18)]">
        <header className="flex items-start gap-3 border-b border-[var(--line)] px-5 py-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              {c ? <Link href={`/cases/${c.tc_id}`} className="mono text-[12px] font-medium text-[var(--accent)] hover:underline">{c.tc_id}</Link> : <span className="h-3 w-24 animate-pulse bg-[var(--line-soft)]" />}
              {c && <PriorityChip p={c.priority as 'Critical'} />}
              {c && <span className="text-[12px] text-[var(--muted)]">{c.zone} · {c.page}</span>}
            </div>
            <h2 className="mt-1 text-[17px] leading-snug font-semibold text-[var(--navy-ink)]">{c?.title ?? 'Loading…'}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="-mr-2 flex h-8 w-8 cursor-pointer items-center justify-center text-[var(--muted)] hover:bg-[var(--surface-3)] hover:text-[var(--ink)]">✕</button>
        </header>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {error && <p className="text-[13px] text-[var(--crit)]">{error}</p>}
          {c && (
            <>
              {tester && (
                <section>
                  <h3 className="label mb-2">Record a result</h3>
                  {active
                    ? <div className="flex flex-wrap items-center gap-2"><CaseResultActions caseId={c.id} onDone={reload} /></div>
                    : <p className="text-[12.5px] text-[var(--muted)]">Start the sprint to record results here, so they count toward it.</p>}
                </section>
              )}

              {t ? (
                <section className="border border-[var(--line)]">
                  <div className="flex flex-wrap items-center gap-2 border-b border-[var(--line)] bg-[var(--surface-3)] px-3 py-2">
                    <Link href={`/tickets/${encodeURIComponent(t.key)}`} className="mono text-[12px] font-medium text-[var(--accent)] hover:underline">{t.key}</Link>
                    <StateChip s={t.state as TicketState} />
                    {t.fixed_in_build && <span className="mono text-[11.5px] text-[var(--muted)]">fixed in {t.fixed_in_build}</span>}
                  </div>
                  <div className="space-y-3 p-3">
                    <div className="flex flex-wrap gap-2"><TicketActions ticketId={t.id} moves={allowedMoves(t.state as TicketState, role)} onDone={reload} /></div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <label><span className="label">Owner</span>
                        <TicketField ticketId={t.id} field="owner_id" value={t.owner_id ?? ''} disabled={!tester} onDone={reload}
                          options={[{ value: '', label: 'Unassigned' }, ...people.map((p) => ({ value: p.id, label: p.name }))]} />
                      </label>
                      <label><span className="label">Severity</span>
                        <TicketField ticketId={t.id} field="severity" value={t.severity} disabled={!tester} onDone={reload}
                          options={['Critical', 'High', 'Medium', 'Low'].map((p) => ({ value: p, label: p }))} />
                      </label>
                      <label><span className="label">Sprint</span>
                        <TicketField ticketId={t.id} field="current_sprint_id" value={t.current_sprint_id ?? ''} disabled={!tester} onDone={reload}
                          options={[{ value: '', label: 'No sprint' }, ...sprints.map((s) => ({ value: s.id, label: s.name }))]} />
                      </label>
                    </div>
                    <form className="space-y-2" onSubmit={(e) => {
                      e.preventDefault()
                      const body = comment.trim()
                      if (!body) return
                      startPost(async () => {
                        const res = await addTicketComment(t.id, body)
                        if (res.error) toast(res.error, 'error')
                        else { setComment(''); toast('Comment added'); void reload() }
                      })
                    }}>
                      <textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Comment on the ticket" className="input w-full" />
                      <button disabled={posting || !comment.trim()} className="btn btn-primary">{posting ? 'Posting…' : 'Comment'}</button>
                    </form>
                    {data!.comments.length > 0 && (
                      <ul className="space-y-2 border-l border-[var(--line)] pl-3">
                        {data!.comments.map((m, i) => (
                          <li key={i} className="text-[12.5px]">
                            <span className="text-[11.5px] text-[var(--muted)]"><b className="text-[var(--ink-2)]">{m.who ?? 'Someone'}</b> · {day(m.created_at)}</span>
                            <p className="whitespace-pre-wrap">{m.body}</p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </section>
              ) : (
                <p className="text-[12.5px] text-[var(--muted)]">No open ticket.</p>
              )}

              <section className="grid grid-cols-2 gap-3">
                <label><span className="label mb-1 block">Tester</span>
                  <CaseTesterField caseId={c.id} value={c.tester_id} people={people} disabled={!tester} onDone={reload} />
                </label>
                <label><span className="label mb-1 block">Automation</span>
                  <CaseAutomationField caseId={c.id} value={c.automation} disabled={!tester} onDone={reload} />
                </label>
              </section>

              {(c.steps || c.expected) && (
                <section className="space-y-2 text-[12.5px]">
                  <h3 className="label">How to test</h3>
                  {c.preconditions && <p><b className="font-semibold">Before you start:</b> {c.preconditions}</p>}
                  {c.steps && <p className="whitespace-pre-wrap">{c.steps}</p>}
                  {c.test_data && <p><b className="font-semibold">Data:</b> {c.test_data}</p>}
                  {c.expected && <p><b className="font-semibold">Expected:</b> {c.expected}</p>}
                </section>
              )}

              {data!.runs.length > 0 && (
                <section>
                  <h3 className="label mb-2">Recent results</h3>
                  <ul className="divide-y divide-[var(--row)] border border-[var(--line-soft)]">
                    {data!.runs.map((r, i) => (
                      <li key={i} className="px-3 py-1.5 text-[12px]">
                        <div className="flex items-center gap-2">
                          <span className="w-16 text-[var(--muted)]">{r.kind === 'auto' ? 'Automated' : 'Manual'}</span>
                          <ResultChip r={r.result as RunResult} />
                          <span className="ml-auto text-[var(--faint)]">{r.who ?? (r.kind === 'auto' ? 'CI' : 'Workbook')} · {day(r.recorded_at)}</span>
                        </div>
                        {r.note && <p className="mt-1 whitespace-pre-wrap text-[var(--ink-2)]">{r.note}</p>}
                        {r.files.length > 0 && (
                          <div className="mt-1.5 flex flex-wrap gap-2">
                            {r.files.map((f) => (
                              <a key={f.url} href={f.url} target="_blank" rel="noreferrer" title={f.name}
                                className="block border border-[var(--line)] hover:border-[var(--navy)]">
                                {/\.(png|jpe?g|gif|webp)$/i.test(f.name)
                                  // eslint-disable-next-line @next/next/no-img-element -- signed link to a private screenshot
                                  ? <img src={f.url} alt={f.name} className="h-14 w-20 object-cover" />
                                  : <span className="flex h-14 w-20 items-center justify-center px-1 text-center text-[10.5px] text-[var(--accent)]">{f.name}</span>}
                              </a>
                            ))}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                </section>
              )}
            </>
          )}
        </div>
        <footer className="flex justify-between border-t border-[var(--line)] px-5 py-3 text-[12.5px]">
          {c ? <Link href={`/cases/${c.tc_id}`} className="text-[var(--accent)] hover:underline">Open the full test case</Link> : <span />}
          {t && <Link href={`/tickets/${encodeURIComponent(t.key)}`} className="text-[var(--accent)] hover:underline">Open the ticket</Link>}
        </footer>
      </aside>
    </div>
  )
}
