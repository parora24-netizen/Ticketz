import { notFound } from 'next/navigation'
import { CaseLink, Chip, PageHeader, PriorityChip, StateChip } from '@/components/ui'
import { Flash } from '@/components/flash'
import { getMe } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { fmtDate, loadPeople, loadSprints } from '@/lib/data'
import { ACTION_LABEL, STATE_LABEL, allowedMoves, requiredFor, type TicketState } from '@/lib/workflow/ticket-machine'
import { moveTicket, updateTicket } from '../../actions'

export default async function TicketPage({
  params, searchParams,
}: { params: Promise<{ key: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { key } = await params
  const sp = await searchParams
  const me = await getMe()
  const supabase = await createClient()
  const { data: t } = await supabase.from('ticket_list').select('*').eq('key', decodeURIComponent(key)).maybeSingle()
  if (!t) notFound()
  const [{ data: events }, people, sprints] = await Promise.all([
    supabase.from('ticket_events').select('*, people(name)').eq('ticket_id', t.id).order('at', { ascending: false }),
    loadPeople(),
    loadSprints(),
  ])
  const sprintName = new Map(sprints.map((s) => [s.id, s.name]))
  const moves = allowedMoves(t.state as TicketState, me.role)
  const back = `/tickets/${encodeURIComponent(t.key)}`
  const canEdit = me.role !== 'dev'

  return (
    <>
      <PageHeader title={t.title} sub={<><span className="font-mono">{t.key}</span>{t.tc_id && <> · <CaseLink tcId={t.tc_id} /></>}{t.zone && ` · ${t.zone} · ${t.page}`}</>}>
        <PriorityChip p={t.severity} /><StateChip s={t.state} />
        {t.kind === 'test_mismatch' && <Chip>Test issue</Chip>}
      </PageHeader>
      <Flash error={sp.error} ok={sp.ok} />

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="card p-4 lg:col-span-2">
          <h2 className="label">Details</h2>
          <p className="mt-1 whitespace-pre-wrap text-sm">{t.description || 'No description.'}</p>
          <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div><dt className="label">Owner</dt><dd>{t.owner_name ?? 'Unowned'}</dd></div>
            <div><dt className="label">Logged</dt><dd>{fmtDate(t.logged_on)}</dd></div>
            <div><dt className="label">Found in</dt><dd>{t.found_in_sprint_id ? sprintName.get(t.found_in_sprint_id) : 'Before sprints'}</dd></div>
            <div><dt className="label">Sprint now</dt><dd>{t.current_sprint_id ? sprintName.get(t.current_sprint_id) : '—'}</dd></div>
            {t.fixed_in_build && <div><dt className="label">Fixed in</dt><dd className="font-mono">{t.fixed_in_build}</dd></div>}
            {t.defer_reason && <div className="col-span-2"><dt className="label">Deferred because</dt><dd>{t.defer_reason}</dd></div>}
          </dl>

          <h2 className="label mt-6">History</h2>
          <ol className="mt-2 space-y-2 border-l border-[var(--line)] pl-4">
            {(events ?? []).map((e) => (
              <li key={e.id} className="text-sm">
                <span className="text-[var(--muted)]">{fmtDate(e.at)} · {e.people?.name ?? 'System'}</span>
                <div>
                  {e.from_state && e.from_state !== e.to_state ? `${STATE_LABEL[e.from_state as TicketState]} → ${STATE_LABEL[e.to_state as TicketState]}` : e.from_state ? '' : `Opened as ${STATE_LABEL[e.to_state as TicketState]}`}
                  {e.note && <span className="text-[var(--muted)]">{e.from_state !== e.to_state && e.from_state ? ' · ' : ''}{e.note}</span>}
                </div>
              </li>
            ))}
          </ol>
        </section>

        <aside className="space-y-4">
          <section className="card p-4">
            <h2 className="font-semibold">Next step</h2>
            {moves.length === 0 && <p className="mt-2 text-sm text-[var(--muted)]">Nothing for a {me.role === 'qa' ? 'QA' : me.role} to do here.</p>}
            <div className="mt-2 space-y-3">
              {moves.map((to) => {
                const need = requiredFor(to)
                return (
                  <form key={to} action={moveTicket} className="space-y-1.5">
                    <input type="hidden" name="ticket_id" value={t.id} />
                    <input type="hidden" name="to" value={to} />
                    <input type="hidden" name="back" value={back} />
                    {need === 'fixed_in_build' && <input name="fixed_in_build" required placeholder="Build with the fix" className="input w-full" />}
                    {need === 'defer_reason' && <input name="defer_reason" required placeholder="Why it can wait past 26.111" className="input w-full" />}
                    {need === 'duplicate_of' && <input name="duplicate_key" required placeholder="Key of the original ticket" className="input w-full" />}
                    {(to === 'closed' || to === 'reopened') && <input name="note" placeholder="Retest note (optional)" className="input w-full" />}
                    <button className={`btn w-full ${to === 'deferred' || to === 'duplicate' ? '' : 'btn-primary'}`}>{ACTION_LABEL[to] ?? STATE_LABEL[to]}</button>
                  </form>
                )
              })}
            </div>
          </section>
          <section className="card p-4">
            <h2 className="font-semibold">Owner and severity</h2>
            <form action={updateTicket} className="mt-2 space-y-2">
              <input type="hidden" name="ticket_id" value={t.id} />
              <input type="hidden" name="back" value={back} />
              <select name="owner_id" defaultValue={t.owner_id ?? ''} className="select w-full" disabled={!canEdit}>
                <option value="">Unowned</option>
                {people.filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <select name="severity" defaultValue={t.severity} className="select w-full" disabled={!canEdit}>
                {['Critical', 'High', 'Medium', 'Low'].map((p) => <option key={p}>{p}</option>)}
              </select>
              {canEdit ? <button className="btn w-full">Save</button> : <p className="text-xs text-[var(--muted)]">Lead or QA assigns owners and severity. Start the fix to take it.</p>}
            </form>
          </section>
        </aside>
      </div>
    </>
  )
}
