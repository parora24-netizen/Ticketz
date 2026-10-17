import { SubmitButton } from '@/components/submit-button'
import { notFound } from 'next/navigation'
import { Chip, PageHeader, PriorityChip, ResultChip, StateChip, TicketLink } from '@/components/ui'
import { Flash } from '@/components/flash'
import { getMe } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { fmtDate, loadSprints } from '@/lib/data'
import { mismatch } from '@/lib/workflow/case-stage'
import { raiseTicket, setAutomation } from '../../actions'
import { CaseResultActions } from '@/components/case-controls'

export default async function CasePage({
  params, searchParams,
}: { params: Promise<{ tcId: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { tcId } = await params
  const sp = await searchParams
  const me = await getMe()
  const supabase = await createClient()
  const { data: c } = await supabase.from('test_cases').select('*, areas(zone, page)').eq('tc_id', decodeURIComponent(tcId)).maybeSingle()
  if (!c) notFound()
  const [{ data: runs }, { data: tickets }, sprints] = await Promise.all([
    supabase.from('test_runs').select('*, people(name)').eq('case_id', c.id).order('recorded_at', { ascending: false }),
    supabase.from('tickets').select('key, title, state, severity').eq('case_id', c.id).order('logged_on', { ascending: false }),
    loadSprints(),
  ])
  const sprintName = new Map(sprints.map((s) => [s.id, s.name]))
  const lastAuto = runs?.find((r) => r.kind === 'auto')?.result ?? null
  const lastManual = runs?.find((r) => r.kind === 'manual')?.result ?? null
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
            </dl>
          </section>
          {canTest && (
            <section className="card p-4">
              <h2 className="font-semibold">Automation</h2>
              <form action={setAutomation} className="mt-2 flex gap-2">
                <input type="hidden" name="case_id" value={c.id} />
                <input type="hidden" name="back" value={back} />
                <select name="automation" defaultValue={c.automation} className="select flex-1">
                  <option value="not_automated">Not automated yet</option>
                  <option value="automated">Automated</option>
                  <option value="manual_only">Manual only</option>
                </select>
                <SubmitButton primary>Save</SubmitButton>
              </form>
            </section>
          )}
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

      <section className="card mt-4 overflow-x-auto">
        <h2 className="px-4 pt-4 font-semibold">Result history</h2>
        <table className="table mt-2">
          <thead><tr><th>When</th><th>Kind</th><th>Result</th><th>Sprint</th><th>Build</th><th>By</th><th>Note</th></tr></thead>
          <tbody>
            {(runs ?? []).map((r) => (
              <tr key={r.id}>
                <td className="whitespace-nowrap">{fmtDate(r.recorded_at)}</td>
                <td>{r.kind === 'auto' ? 'Automated' : 'Manual'}</td>
                <td><ResultChip r={r.result} /></td>
                <td>{r.sprint_id ? sprintName.get(r.sprint_id) : 'Before sprints'}</td>
                <td className="font-mono text-xs">{r.build ?? ''}</td>
                <td>{r.people?.name ?? (r.kind === 'auto' ? 'CI' : '')}</td>
                <td className="max-w-sm whitespace-pre-wrap text-xs">{r.note ?? ''}{r.url && <> <a href={r.url} className="text-[var(--accent)] hover:underline" target="_blank" rel="noreferrer">report</a></>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  )
}
