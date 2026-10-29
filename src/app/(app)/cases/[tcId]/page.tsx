import { SubmitButton } from '@/components/submit-button'
import { MentionTextarea, WithMentions } from '@/components/mentions'
import { notFound } from 'next/navigation'
import { Chip, PageHeader, PriorityChip, ResultChip, StateChip, TicketLink } from '@/components/ui'
import { Flash } from '@/components/flash'
import { getMe } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { loadAreas, loadPeople, loadSprints } from '@/lib/data'
import { MARKERS, Timeline, type TimelineItem } from '@/components/timeline'
import { editItems, ticketEventItems } from '@/components/ticket-timeline'
import { changeEntries, type ChangeRow } from '@/lib/activity'
import { mismatch } from '@/lib/workflow/case-stage'
import { addCaseComment, raiseTicket } from '../../actions'
import { CaseAutomationField, CaseResultActions, UndoResultButton } from '@/components/case-controls'

export default async function CasePage({
  params, searchParams,
}: { params: Promise<{ tcId: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { tcId } = await params
  const sp = await searchParams
  const me = await getMe()
  const supabase = await createClient()
  const { data: c } = await supabase.from('test_cases').select('*, areas(zone, page)').eq('tc_id', decodeURIComponent(tcId)).maybeSingle()
  if (!c) notFound()
  const [{ data: runs }, { data: tickets }, sprints, { data: edits }, people, areas, { data: comments }] = await Promise.all([
    supabase.from('test_runs').select('*, people(name)').eq('case_id', c.id).order('recorded_at', { ascending: false }),
    supabase.from('tickets').select('id, key, title, state, severity').eq('case_id', c.id).order('logged_on', { ascending: false }),
    loadSprints(),
    // Field edits; the change log is readable by the lead only.
    supabase.from('change_log').select('*').eq('row_id', c.id).eq('action', 'update').order('at', { ascending: false }).limit(200),
    loadPeople(),
    loadAreas(),
    supabase.from('case_comments').select('id, body, created_at, people(name)').eq('case_id', c.id).order('created_at', { ascending: false }),
  ])
  const teamNames = people.filter((p) => p.active).map((p) => p.name)
  const { data: ticketEvents } = tickets?.length
    ? await supabase.from('ticket_events').select('id, ticket_id, from_state, to_state, note, at, people(name)').in('ticket_id', tickets.map((t) => t.id))
    : { data: [] }
  const sprintName = new Map(sprints.map((s) => [s.id, s.name]))
  const names = new Map<string, string>([
    ...people.map((p) => [p.id, p.name] as [string, string]),
    ...areas.map((a) => [a.id, `${a.zone} · ${a.page}`] as [string, string]),
    ...sprintName,
  ])
  // Screenshots attached to results: short-lived links, the files stay private.
  const paths = (runs ?? []).flatMap((r) => (r.attachments as string[] | null) ?? [])
  const signed = new Map<string, string>()
  if (paths.length) {
    const { data: links } = await supabase.storage.from('evidence').createSignedUrls(paths, 3600)
    for (const l of links ?? []) if (l.signedUrl && l.path) signed.set(l.path, l.signedUrl)
  }
  const lastAuto = runs?.find((r) => r.kind === 'auto')?.result ?? null
  const lastManualRun = runs?.find((r) => r.kind === 'manual')
  const lastManual = lastManualRun?.result ?? null
  const mm = mismatch(lastAuto, lastManual)
  const back = `/cases/${encodeURIComponent(c.tc_id)}`
  const canTest = me.role !== 'dev'

  return (
    <>
      <PageHeader title={c.title} sub={<><span className="mono">{c.tc_id}</span> · {c.areas?.zone} · {c.areas?.page}{c.source_page && c.source_page !== c.areas?.page ? ` (${c.source_page})` : ''}</>}>
        {mm && <Chip tone="warn">{mm === 'type_ii' ? 'Automation passed, manual failed' : 'Automation failed, manual passed'}</Chip>}
        {canTest && <CaseResultActions caseId={c.id} />}
      </PageHeader>
      <Flash error={sp.error} ok={sp.ok} />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="card space-y-4 p-5">
          {[
            ['Pre-conditions', c.preconditions],
            ['Steps', c.steps],
            ['Test data', c.test_data],
            ['Expected result', c.expected],
          ].map(([label, text]) => text ? (
            <div key={label}><h2 className="label">{label}</h2><p className="mt-1 whitespace-pre-wrap text-sm">{text}</p></div>
          ) : null)}
        </section>

        <aside className="space-y-4">
          <section className="card">
            <h3 className="border-b border-[var(--line)] px-4 py-2.5 text-[14px] font-semibold">Details</h3>
            <dl className="divide-y divide-[var(--row)] text-[13px]">
              <div className="flex items-center justify-between px-4 py-2.5"><dt className="label">Priority</dt><dd><PriorityChip p={c.priority} /></dd></div>
              <div className="flex items-center justify-between px-4 py-2.5"><dt className="label">Last automated</dt><dd><ResultChip r={lastAuto} /></dd></div>
              <div className="flex items-center justify-between px-4 py-2.5"><dt className="label">Last manual</dt><dd><ResultChip r={lastManual} /></dd></div>
              {c.test_type && <div className="flex items-center justify-between px-4 py-2.5"><dt className="label">Type</dt><dd>{c.test_type}</dd></div>}
              <div className="px-4 py-2.5"><dt className="label mb-1">Automation</dt><dd><CaseAutomationField caseId={c.id} value={c.automation} disabled={!canTest} /></dd></div>
            </dl>
          </section>
          <section className="card p-4">
            <h2 className="font-semibold">Tickets</h2>
            <ul className="mt-2 space-y-1.5">
              {(tickets ?? []).map((t) => (
                <li key={t.key} className="flex items-center gap-2 text-sm"><TicketLink k={t.key} /><StateChip s={t.state} /></li>
              ))}
              {!tickets?.length && <li className="text-sm text-[var(--muted)]">None</li>}
            </ul>
            <details id="ticket" className="mt-3">
              <summary className="cursor-pointer text-sm text-[var(--accent)]">Raise a ticket</summary>
              <form action={raiseTicket} className="mt-2 space-y-2">
                <input type="hidden" name="case_id" value={c.id} />
                <input type="hidden" name="back" value={back} />
                <input name="title" defaultValue={c.title} required className="input w-full" />
                <textarea name="description" rows={3} placeholder="What failed, on which build" className="input w-full" />
                <div className="flex gap-2">
                  <select name="severity" defaultValue={c.priority} className="select flex-1">
                    {['Critical', 'High', 'Medium', 'Low'].map((p) => <option key={p}>{p}</option>)}
                  </select>
                  <select name="kind" defaultValue="defect" className="select flex-1">
                    <option value="defect">Product defect</option>
                    <option value="test_mismatch">Test is wrong</option>
                  </select>
                </div>
                <SubmitButton primary className="w-full" pendingText="Raising…">Raise ticket</SubmitButton>
              </form>
            </details>
          </section>
        </aside>
      </div>

      <section id="comments" className="card mt-4 p-5">
        <h2 className="font-semibold">History</h2>
        <p className="mt-0.5 text-[12px] text-[var(--muted)]">Comments, results, its tickets and edits, newest first.</p>
        <form action={addCaseComment} className="mt-3 space-y-2">
          <input type="hidden" name="case_id" value={c.id} />
          <input type="hidden" name="back" value={back} />
          <MentionTextarea name="body" required rows={2} people={teamNames} placeholder="Ask or note something about this case. Type @ to mention someone." className="input w-full" />
          <SubmitButton primary pendingText="Posting…">Comment</SubmitButton>
        </form>
        <Timeline empty="No results yet." items={[
          ...(comments ?? []).map((m): TimelineItem => ({
            id: `c${m.id}`, at: m.created_at as string, marker: MARKERS.comment, body: (
              <>
                <p><b className="font-semibold text-[var(--ink)]">{(m.people as unknown as { name: string } | null)?.name ?? 'Someone'}</b> commented</p>
                <p className="mt-1.5 whitespace-pre-wrap border border-[var(--line-soft)] bg-[var(--surface-3)] px-3 py-2 text-[13px]"><WithMentions text={m.body as string} people={teamNames} /></p>
              </>
            ),
          })),
          ...(runs ?? []).map((r): TimelineItem => {
            const files = ((r.attachments as string[] | null) ?? []).filter((p) => signed.get(p))
            const meta = [r.sprint_id ? `Sprint ${sprintName.get(r.sprint_id) ?? ''}` : 'Before sprints', r.build && `build ${r.build}`].filter(Boolean).join(' · ')
            return {
              id: `r${r.id}`, at: r.recorded_at,
              marker: r.result === 'passed' ? MARKERS.passed : r.result === 'failed' ? MARKERS.failed : MARKERS.other,
              body: (
                <>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <b className="font-semibold text-[var(--ink)]">{r.people?.name ?? (r.kind === 'auto' ? 'CI' : 'Workbook')}</b>
                    <span>{r.kind === 'auto' ? 'automated run' : 'manual test'}</span>
                    <ResultChip r={r.result} />
                    <span className="text-[12px] text-[var(--muted)]">{meta}</span>
                    {canTest && r.id === lastManualRun?.id && <UndoResultButton runId={r.id} back={back} result={r.result} />}
                  </div>
                  {(r.note || r.url) && (
                    <p className="mt-1 whitespace-pre-wrap text-[12.5px] text-[var(--muted)]">
                      {r.note}{r.url && <> <a href={r.url} className="text-[var(--accent)] hover:underline" target="_blank" rel="noreferrer">report</a></>}
                    </p>
                  )}
                  {files.length > 0 && (
                    <p className="mt-1 flex flex-wrap gap-x-3 text-[12px]">
                      {files.map((path, i) => (
                        <a key={path} href={signed.get(path)} target="_blank" rel="noreferrer" className="text-[var(--accent)] hover:underline">
                          {path.split('/').pop()!.replace(/^[0-9a-f-]{36}-/, '') || `file ${i + 1}`}
                        </a>
                      ))}
                    </p>
                  )}
                </>
              ),
            }
          }),
          ...(tickets ?? []).flatMap((t) => ticketEventItems(
            (ticketEvents ?? []).filter((e) => e.ticket_id === t.id).map((e) => ({
              id: `t${e.id}`, at: e.at as string, who: (e.people as unknown as { name: string } | null)?.name ?? null, from_state: e.from_state, to_state: e.to_state, note: e.note,
            })),
            <TicketLink k={t.key} />,
          )),
          ...editItems(changeEntries((edits ?? []) as ChangeRow[], names).map((x) => ({ id: x.key, at: x.at, who: x.actor_id ? names.get(x.actor_id) ?? 'Someone' : null, fields: x.fields ?? [] }))),
        ]} />
      </section>
    </>
  )
}
