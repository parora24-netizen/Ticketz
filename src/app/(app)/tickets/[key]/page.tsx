import { MentionTextarea } from '@/components/mentions'
import { TicketTimeline } from '@/components/ticket-timeline'
import { changeEntries, type ChangeRow } from '@/lib/activity'
import { SubmitButton } from '@/components/submit-button'
import { notFound } from 'next/navigation'
import { CaseLink, Chip, PageHeader, StateChip } from '@/components/ui'
import { Flash } from '@/components/flash'
import { getMe } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { fmtDate, loadPeople, loadSprints, loadTickets } from '@/lib/data'
import { TicketNav } from '@/components/ticket-nav'
import { allowedMoves, type TicketState } from '@/lib/workflow/ticket-machine'
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
  const [{ data: edits }, { data: events }, { data: comments }, { data: tc }, { data: lastFail }, people, sprints, allTickets] = await Promise.all([
    // Field edits (severity, title, description…); the change log is readable by the lead only.
    supabase.from('change_log').select('*').eq('row_id', t.id).eq('action', 'update').order('at', { ascending: false }).limit(200),
    supabase.from('ticket_events').select('*, people(name)').eq('ticket_id', t.id).order('at', { ascending: false }),
    supabase.from('ticket_comments').select('id, body, created_at, people(name)').eq('ticket_id', t.id).order('created_at', { ascending: false }),
    t.case_id ? supabase.from('test_cases').select('preconditions, steps, test_data, expected').eq('id', t.case_id).maybeSingle() : Promise.resolve({ data: null }),
    t.case_id ? supabase.from('test_runs').select('result, note, build, recorded_at, kind').eq('case_id', t.case_id).in('result', ['failed', 'known_defect', 'blocked']).order('recorded_at', { ascending: false }).limit(1).maybeSingle() : Promise.resolve({ data: null }),
    loadPeople(),
    loadSprints(),
    loadTickets(),
  ])
  // Screenshots raised with the ticket, through short-lived signed links (the bucket is private).
  const attachments = ((t.attachments as string[] | null) ?? [])
  const { data: links } = attachments.length ? await supabase.storage.from('evidence').createSignedUrls(attachments, 3600) : { data: [] }
  const shots = (links ?? []).filter((l) => l.signedUrl && l.path).map((l) => ({ url: l.signedUrl as string, name: l.path!.split('/').pop()!.replace(/^[0-9a-f-]{36}-/, '') }))
  const sprintName = new Map(sprints.map((s) => [s.id, s.name]))
  const teamNames = people.filter((p) => p.active).map((p) => p.name)
  const names = new Map<string, string>([...people.map((p) => [p.id, p.name] as [string, string]), ...sprintName])
  const moves = allowedMoves(t.state as TicketState, me.role)
  const back = `/tickets/${encodeURIComponent(t.key)}`
  const canEdit = me.role !== 'dev'

  const severityOptions = ['Critical', 'High', 'Medium', 'Low'].map((p) => ({ value: p, label: p }))
  const ownerOptions = [{ value: '', label: 'Unassigned' }, ...people.filter((p) => p.active).map((p) => ({ value: p.id, label: p.name }))]
  const resolved = ['closed', 'deferred', 'duplicate'].includes(t.state)

  // When the ticket was not opened from a list: step through open tickets, most severe first.
  const SEV = ['Critical', 'High', 'Medium', 'Low']
  const fallback = allTickets.filter((x) => !['closed', 'deferred', 'duplicate'].includes(x.state))
    .sort((a, b) => SEV.indexOf(a.severity) - SEV.indexOf(b.severity) || b.logged_on.localeCompare(a.logged_on))
    .map((x) => x.key)

  return (
    <>
      <TicketNav current={t.key} fallback={fallback.includes(t.key) ? fallback : [t.key, ...fallback]} />
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
          {shots.length > 0 && (
            <div className="mt-4">
              <h3 className="label">Screenshots</h3>
              <ul className="mt-1.5 flex flex-wrap gap-2">
                {shots.map((s) => (
                  <li key={s.url}>
                    <a href={s.url} target="_blank" rel="noreferrer" className="block border border-[var(--line)] bg-white hover:border-[var(--navy)]">
                      {/\.pdf$/i.test(s.name)
                        ? <span className="flex h-24 w-36 items-center justify-center px-2 text-center text-[11.5px] text-[var(--accent)]">{s.name}</span>
                        // eslint-disable-next-line @next/next/no-img-element -- a signed link to a private file, not a static asset
                        : <img src={s.url} alt={s.name} className="h-24 w-36 object-cover" />}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {tc && (tc.steps || tc.expected) && (
            <div className="mt-5 border border-[var(--line-soft)] bg-[var(--surface-3)] p-3.5">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="label">How to reproduce · from <CaseLink tcId={t.tc_id!} /></h3>
                {lastFail && <span className="text-[11.5px] text-[var(--muted)]">Last {lastFail.result.replace('_', ' ')} {fmtDate(lastFail.recorded_at)}{lastFail.build ? ` on ${lastFail.build}` : ''} ({lastFail.kind})</span>}
              </div>
              {tc.preconditions && <p className="mt-2 text-[12.5px]"><b className="font-semibold">Before you start:</b> {tc.preconditions}</p>}
              {tc.steps && <p className="mt-2 whitespace-pre-wrap text-[12.5px]">{tc.steps}</p>}
              {tc.test_data && <p className="mt-2 text-[12.5px]"><b className="font-semibold">Data:</b> {tc.test_data}</p>}
              {tc.expected && <p className="mt-2 text-[12.5px]"><b className="font-semibold">Expected:</b> {tc.expected}</p>}
              {lastFail?.note && <p className="mt-2 text-[12.5px] text-[var(--crit)]"><b className="font-semibold">What happened:</b> {lastFail.note}</p>}
            </div>
          )}

          <h3 className="label mt-6">Activity</h3>
          <form action={addComment} className="mt-2 space-y-2">
            <input type="hidden" name="ticket_id" value={t.id} />
            <input type="hidden" name="back" value={back} />
            <MentionTextarea name="body" required rows={3} people={teamNames} placeholder="Add a comment: what you found, what you tried, what is blocking. Type @ to mention someone." className="input w-full" />
            <SubmitButton primary pendingText="Posting…">Comment</SubmitButton>
          </form>
          <TicketTimeline
            events={(events ?? []).map((e) => ({ id: `e-${e.id}`, at: e.at as string, who: e.people?.name ?? null, from_state: e.from_state, to_state: e.to_state, note: e.note }))}
            comments={(comments ?? []).map((c) => ({ id: `c-${c.id}`, at: c.created_at as string, who: (c.people as unknown as { name: string } | null)?.name ?? 'Someone', body: c.body as string }))}
            people={teamNames}
            edits={changeEntries((edits ?? []) as ChangeRow[], names).map((x) => ({ id: x.key, at: x.at, who: x.actor_id ? names.get(x.actor_id) ?? 'Someone' : null, fields: x.fields ?? [] }))}
          />
        </section>

        <aside className="card h-fit">
          <h3 className="border-b border-[var(--line)] px-4 py-2.5 text-[14px] font-semibold">Details</h3>
          <dl className="divide-y divide-[var(--row)] text-[13px]">
            <div className="flex items-center justify-between gap-3 px-4 py-2.5"><dt className="label">Status</dt><dd><StateChip s={t.state} /></dd></div>
            <div className="px-4 py-2.5"><dt className="label mb-1">Owner</dt><dd>
              <TicketField ticketId={t.id} field="owner_id" value={t.owner_id ?? ''} options={ownerOptions} />
              {!canEdit && <p className="mt-1 text-[11.5px] text-[var(--faint)]">Hand it to whoever acts next, e.g. back to QA for a retest.</p>}
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
