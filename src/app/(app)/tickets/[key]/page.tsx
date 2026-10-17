import { SubmitButton } from '@/components/submit-button'
import { notFound } from 'next/navigation'
import { CaseLink, Chip, PageHeader, StateChip } from '@/components/ui'
import { Flash } from '@/components/flash'
import { getMe } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { fmtDate, loadPeople, loadSprints } from '@/lib/data'
import { STATE_LABEL, allowedMoves, type TicketState } from '@/lib/workflow/ticket-machine'
import { addComment, assignToMe } from '../../actions'
import { TicketActions, TicketField } from '@/components/ticket-controls'

export default async function TicketPage({
  params, searchParams,
}: { params: Promise<{ key: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { key } = await params
  const sp = await searchParams
  const me = await getMe()
  const supabase = await createClient()
  const { data: t } = await supabase.from('ticket_list').select('*').eq('key', decodeURIComponent(key)).maybeSingle()
  if (!t) notFound()
  const [{ data: events }, { data: comments }, people, sprints] = await Promise.all([
    supabase.from('ticket_events').select('*, people(name)').eq('ticket_id', t.id).order('at', { ascending: false }),
    supabase.from('ticket_comments').select('id, body, created_at, people(name)').eq('ticket_id', t.id).order('created_at', { ascending: false }),
    loadPeople(),
    loadSprints(),
  ])
  const sprintName = new Map(sprints.map((s) => [s.id, s.name]))
  const moves = allowedMoves(t.state as TicketState, me.role)
  const back = `/tickets/${encodeURIComponent(t.key)}`
  const canEdit = me.role !== 'dev'

  const severityOptions = ['Critical', 'High', 'Medium', 'Low'].map((p) => ({ value: p, label: p }))
  const ownerOptions = [{ value: '', label: 'Unassigned' }, ...people.filter((p) => p.active).map((p) => ({ value: p.id, label: p.name }))]
  const resolved = ['closed', 'deferred', 'duplicate'].includes(t.state)

  return (
    <>
      <PageHeader title={t.title} sub={<><span className="mono">{t.key}</span>{t.tc_id && <> · <CaseLink tcId={t.tc_id} /></>}{t.zone && ` · ${t.zone} · ${t.page}`}</>}>
        {t.owner_id !== me.id && !resolved && (
          <form action={assignToMe}>
            <input type="hidden" name="ticket_id" value={t.id} />
            <input type="hidden" name="back" value={back} />
            <SubmitButton pendingText="Assigning…">Assign to me</SubmitButton>
          </form>
        )}
        <TicketActions ticketId={t.id} moves={moves} />
      </PageHeader>
      <Flash error={sp.error} ok={sp.ok} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="card p-5">
          <h3 className="label">Description</h3>
          <p className="mt-1.5 whitespace-pre-wrap text-[13px] text-[var(--ink-2)]">{t.description || 'No description.'}</p>
          {t.defer_reason && <p className="mt-3 border border-[var(--line-soft)] bg-[var(--surface-3)] p-2.5 text-[13px]"><b>Deferred:</b> {t.defer_reason}</p>}

          <h3 className="label mt-6">Activity</h3>
          <form action={addComment} className="mt-2 space-y-2">
            <input type="hidden" name="ticket_id" value={t.id} />
            <input type="hidden" name="back" value={back} />
            <textarea name="body" required rows={3} placeholder="Add a comment: what you found, what you tried, what is blocking" className="input w-full" />
            <SubmitButton primary pendingText="Posting…">Comment</SubmitButton>
          </form>
          <ol className="mt-4 space-y-3 border-l border-[var(--line)] pl-4">
            {[
              ...(comments ?? []).map((c) => ({ id: `c-${c.id}`, at: c.created_at as string, who: (c.people as unknown as { name: string } | null)?.name ?? 'Someone', comment: c.body as string, text: '' })),
              ...(events ?? []).map((e) => ({
                id: `e-${e.id}`, at: e.at as string, who: e.people?.name ?? 'System', comment: '',
                text: `${e.from_state && e.from_state !== e.to_state ? `${STATE_LABEL[e.from_state as TicketState]} → ${STATE_LABEL[e.to_state as TicketState]}` : e.from_state ? '' : `Opened as ${STATE_LABEL[e.to_state as TicketState]}`}${e.note ? `${e.from_state !== e.to_state && e.from_state ? ' · ' : ''}${e.note}` : ''}`,
              })),
            ]
              .sort((a, b) => b.at.localeCompare(a.at))
              .map((x) => (
                <li key={x.id} className="text-[13px]">
                  <span className="text-[12px] text-[var(--muted)]"><b className="font-semibold text-[var(--ink-2)]">{x.who}</b> · {fmtDate(x.at)}</span>
                  {x.comment
                    ? <p className="mt-1 whitespace-pre-wrap border border-[var(--line-soft)] bg-[var(--surface-3)] p-2.5">{x.comment}</p>
                    : <div className="text-[var(--ink-2)]">{x.text}</div>}
                </li>
              ))}
          </ol>
        </section>

        <aside className="card h-fit">
          <h3 className="border-b border-[var(--line)] px-4 py-2.5 text-[14px] font-semibold">Details</h3>
          <dl className="divide-y divide-[var(--row)] text-[13px]">
            <div className="flex items-center justify-between gap-3 px-4 py-2.5"><dt className="label">Status</dt><dd><StateChip s={t.state} /></dd></div>
            <div className="px-4 py-2.5"><dt className="label mb-1">Owner</dt><dd>
              <TicketField ticketId={t.id} field="owner_id" value={t.owner_id ?? ''} options={ownerOptions} disabled={!canEdit} />
              {!canEdit && <p className="mt-1 text-[11.5px] text-[var(--faint)]">Lead or QA assigns. Start the fix to take it.</p>}
            </dd></div>
            <div className="px-4 py-2.5"><dt className="label mb-1">Severity</dt><dd>
              <TicketField ticketId={t.id} field="severity" value={t.severity} options={severityOptions} disabled={!canEdit} />
            </dd></div>
            <div className="flex items-center justify-between gap-3 px-4 py-2.5"><dt className="label">Kind</dt><dd>{t.kind === 'test_mismatch' ? <Chip>Test issue</Chip> : 'Product defect'}</dd></div>
            {t.fixed_in_build && <div className="flex items-center justify-between gap-3 px-4 py-2.5"><dt className="label">Fixed in</dt><dd className="mono">{t.fixed_in_build}</dd></div>}
            <div className="flex items-center justify-between gap-3 px-4 py-2.5"><dt className="label">Logged</dt><dd className="mono text-[12px]">{fmtDate(t.logged_on)}</dd></div>
            <div className="flex items-center justify-between gap-3 px-4 py-2.5"><dt className="label">Found in</dt><dd>{t.found_in_sprint_id ? sprintName.get(t.found_in_sprint_id) : 'Before sprints'}</dd></div>
            <div className="flex items-center justify-between gap-3 px-4 py-2.5"><dt className="label">Sprint now</dt><dd>{t.current_sprint_id ? sprintName.get(t.current_sprint_id) : '—'}</dd></div>
            {t.tc_id && <div className="flex items-center justify-between gap-3 px-4 py-2.5"><dt className="label">Test case</dt><dd><CaseLink tcId={t.tc_id} /></dd></div>}
          </dl>
          {moves.length === 0 && <p className="border-t border-[var(--line)] px-4 py-2.5 text-[12px] text-[var(--muted)]">No moves for a {me.role === 'qa' ? 'QA' : me.role} at this stage.</p>}
        </aside>
      </div>
    </>
  )
}
