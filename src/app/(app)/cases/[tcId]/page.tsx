import { SubmitButton } from '@/components/submit-button'
import { MentionTextarea, WithMentions } from '@/components/mentions'
import { notFound, redirect } from 'next/navigation'
import { Chip, PageHeader, PriorityChip, ResultChip, StateChip, TicketLink } from '@/components/ui'
import { Flash } from '@/components/flash'
import { getMe } from '@/lib/auth'
import { casesByAnyId } from '@/lib/ids'
import { createClient } from '@/lib/supabase/server'
import { loadAreas, loadPeople, loadSprints } from '@/lib/data'
import { MARKERS, Timeline, type TimelineItem } from '@/components/timeline'
import { editItems, ticketEventItems } from '@/components/ticket-timeline'
import { changeEntries, type ChangeRow } from '@/lib/activity'
import { mismatch } from '@/lib/workflow/case-stage'
import { addCaseComment, raiseTicket, updateCaseText } from '../../actions'
import { CaseAutomationField, CaseResultActions, RetireCaseButton, CaseTesterField, UndoResultButton } from '@/components/case-controls'
import { ProposalButtons } from '@/app/(app)/cases/automation/automation-controls'
import { BLOCK_LABEL, KIND_LABEL, askStatus, type AskKind, type AskState } from '@/lib/automation-loop'
import Link from 'next/link'
import { RunHistory } from '@/components/run-history'
import { caseHistory } from '@/lib/runs-server'

export default async function CasePage({
  params, searchParams,
}: { params: Promise<{ tcId: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { tcId } = await params
  const sp = await searchParams
  const me = await getMe()
  const supabase = await createClient()
  const { data: c } = await supabase.from('test_cases').select('*, areas(zone, page)').eq('tc_id', decodeURIComponent(tcId)).maybeSingle()
  if (!c) {
    // An ID from before the renumbering goes to the case's page.
    const asked = decodeURIComponent(tcId).toUpperCase()
    const found = (await casesByAnyId(supabase, [asked])).get(asked)
    if (found) redirect(`/cases/${encodeURIComponent(found.tc_id)}`)
    notFound()
  }
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
  const history = await caseHistory(supabase, c.id)
  // What this case waits on: asks, a blocking defect, a proposal for the lead. Empty until the asks migration runs.
  const [{ data: askLinks }, { data: blocker }] = await Promise.all([
    supabase.from('ask_cases').select('asks(key, kind, title, state)').eq('case_id', c.id),
    c.automation_block_ticket_id ? supabase.from('tickets').select('key, state').eq('id', c.automation_block_ticket_id).maybeSingle() : Promise.resolve({ data: null }),
  ])
  type LinkedAsk = { key: string; kind: AskKind; title: string; state: AskState }
  const asks = ((askLinks ?? []) as unknown as { asks: LinkedAsk | LinkedAsk[] | null }[]).map((l) => (Array.isArray(l.asks) ? l.asks[0] : l.asks)).filter((a): a is LinkedAsk => !!a)
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
  const editing = canTest && sp.edit === '1'
  const retiredBy = c.retired_by ? (await supabase.from('people').select('name').eq('id', c.retired_by).maybeSingle()).data?.name ?? null : null

  return (
    <>
      <PageHeader title={c.title} sub={<><span className="mono">{c.tc_id}</span>{c.legacy_tc_id && <span className="text-[var(--faint)]"> (was <span className="mono">{c.legacy_tc_id}</span>)</span>} · {c.areas?.zone} · {c.areas?.page}{c.source_page && c.source_page !== c.areas?.page ? ` (${c.source_page})` : ''}</>}>
        {mm && <Chip tone="warn">{mm === 'type_ii' ? 'Automation passed, manual failed' : 'Automation failed, manual passed'}</Chip>}
        {c.retired_at && <Chip tone="muted">Retired</Chip>}
        {editing ? (
          <>
            <Link href={back} className="btn">Cancel</Link>
            <button type="submit" form="case-edit" className="btn btn-primary">Save case</button>
          </>
        ) : (
          <>
            {canTest && !c.retired_at && <CaseResultActions caseId={c.id} />}
            {canTest && <Link href={`${back}?edit=1`} className="btn">Edit case</Link>}
            {canTest && <RetireCaseButton caseId={c.id} retired={!!c.retired_at} />}
          </>
        )}
      </PageHeader>
      <Flash error={sp.error} ok={sp.ok} />
      {c.retired_at && (
        <p className="card mb-4 border-[var(--warn-line)] bg-[var(--warn-soft)] px-4 py-2.5 text-[12.5px]">
          <b>Retired</b> {new Date(c.retired_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })}{retiredBy ? ' by ' + retiredBy : ''}: {c.retired_reason}. It is out of every list, board and count, and the runner does not run it.
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        {editing ? (
          <form id="case-edit" action={updateCaseText} className="card space-y-3 p-5">
            <input type="hidden" name="case_id" value={c.id} />
            <input type="hidden" name="tc_id" value={c.tc_id} />
            <label className="block"><span className="label">Title</span><input name="title" defaultValue={c.title} required minLength={3} maxLength={300} className="input mt-1 w-full" /></label>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <label className="block"><span className="label">Priority</span>
                <select name="priority" defaultValue={c.priority} className="select mt-1 w-full">{['Critical', 'High', 'Medium', 'Low'].map((p) => <option key={p}>{p}</option>)}</select></label>
              <label className="block"><span className="label">Page</span>
                <select name="area_id" defaultValue={c.area_id} className="select mt-1 w-full">
                  {areas.map((a) => <option key={a.id} value={a.id}>{a.zone} · {a.page}</option>)}
                </select></label>
              <label className="block"><span className="label">Type</span><input name="test_type" defaultValue={c.test_type ?? ''} maxLength={50} className="input mt-1 w-full" /></label>
            </div>
            {([['preconditions', 'Pre-conditions', 3, 5000], ['steps', 'Steps', 6, 10000], ['test_data', 'Test data', 2, 5000], ['expected', 'Expected result', 4, 5000]] as const).map(([name, label, rows, max]) => (
              <label key={name} className="block"><span className="label">{label}</span>
                <textarea name={name} defaultValue={c[name] ?? ''} rows={rows} maxLength={max} className="input mt-1 w-full font-[inherit]" /></label>
            ))}
            <p className="text-[12px] text-[var(--muted)]">Saving records the change in the case's history, and the automation runner sees the text changed.</p>
            <div className="flex justify-end gap-2">
              <Link href={back} className="btn">Cancel</Link>
              <SubmitButton primary pendingText="Saving…">Save case</SubmitButton>
            </div>
          </form>
        ) : (
        <section className="card space-y-4 p-5">
          {[
            ['Pre-conditions', c.preconditions],
            ['Steps', c.steps],
            ['Test data', c.test_data],
            ['Expected result', c.expected],
          ].map(([label, text]) => text ? (
            <div key={label}><h2 className="label">{label}</h2><p className="mt-1 whitespace-pre-wrap text-sm">{text}</p></div>
          ) : null)}
          {!c.preconditions && !c.steps && !c.test_data && !c.expected && <p className="text-sm text-[var(--muted)]">No text yet.{canTest && <> <Link href={`${back}?edit=1`} className="text-[var(--accent)] hover:underline">Add it</Link>.</>}</p>}
        </section>
        )}

        <aside className="space-y-4">
          <section className="card">
            <h3 className="border-b border-[var(--line)] px-4 py-2.5 text-[14px] font-semibold">Details</h3>
            <dl className="divide-y divide-[var(--row)] text-[13px]">
              <div className="flex items-center justify-between px-4 py-2.5"><dt className="label">Priority</dt><dd><PriorityChip p={c.priority} /></dd></div>
              <div className="flex items-center justify-between px-4 py-2.5"><dt className="label">Last automated</dt><dd><ResultChip r={lastAuto} /></dd></div>
              <div className="flex items-center justify-between px-4 py-2.5"><dt className="label">Last manual</dt><dd><ResultChip r={lastManual} /></dd></div>
              {c.scenario_id && <div className="flex items-center justify-between px-4 py-2.5"><dt className="label">Scenario</dt><dd className="mono">{c.scenario_id}</dd></div>}
              {c.requirement_id && <div className="flex items-center justify-between px-4 py-2.5"><dt className="label">Requirement</dt><dd className="mono">{c.requirement_id}</dd></div>}
              {c.test_type && <div className="flex items-center justify-between px-4 py-2.5"><dt className="label">Type</dt><dd>{c.test_type}</dd></div>}
              <div className="px-4 py-2.5"><dt className="label mb-1">Tester</dt><dd><CaseTesterField caseId={c.id} value={c.tester_id} people={people.filter((p) => p.active).map((p) => ({ id: p.id, name: p.name }))} disabled={!canTest} /></dd></div>
              <div className="px-4 py-2.5"><dt className="label mb-1">Automation</dt><dd><CaseAutomationField caseId={c.id} value={c.automation} disabled={!canTest} />
                {(c.automation_note || c.automation_owner || c.automation_ref) && (
                  <div className="mt-1.5 space-y-0.5 text-[12px] text-[var(--muted)]">
                    {c.automation_note && <p>{c.automation_note}</p>}
                    {c.automation_owner && <p>Claimed by {c.automation_owner}</p>}
                    {c.automation_ref && <p className="mono break-all">{c.automation_ref}</p>}
                  </div>
                )}
                {c.automation_block && <p className="mt-1.5 text-[12px]"><Chip tone="warn">{BLOCK_LABEL[c.automation_block as keyof typeof BLOCK_LABEL] ?? c.automation_block}</Chip>{blocker && <> until <TicketLink k={blocker.key} /> closes</>}</p>}
                {c.needs_detail && <p className="mt-1.5 text-[12px] font-semibold text-[var(--warn)]">The Expected result is a placeholder, so this case waits for its text before it is automated.</p>}
                {c.automation_proposed && (
                  <div className="mt-2 border border-[var(--line-soft)] bg-[var(--surface-3)] p-2 text-[12px]">
                    <p><b className="font-semibold">Proposed as not automatable</b>{c.automation_proposed_reason ? `: ${c.automation_proposed_reason}` : ''}</p>
                    {me.role === 'lead' && <ProposalButtons caseId={c.id} />}
                  </div>
                )}
              </dd></div>
              {asks.length > 0 && (
                <div className="px-4 py-2.5"><dt className="label mb-1">Waiting on</dt><dd className="space-y-1">
                  {asks.map((a) => <p key={a.key} className="text-[12.5px]"><Link href={`/asks/${a.key}`} className="mono font-medium text-[var(--accent)] hover:underline">{a.key}</Link> {KIND_LABEL[a.kind]}: {a.title} <span className="text-[var(--muted)]">({askStatus(a.kind, a.state)})</span></p>)}
                </dd></div>
              )}
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

      <section className="card mt-4">
        <h2 className="border-b border-[var(--line)] px-4 py-2 text-[14px] font-semibold text-[var(--navy-ink)]">Automated runs</h2>
        <RunHistory points={history} />
      </section>

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
