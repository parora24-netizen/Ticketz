import Link from 'next/link'
import { CASES_TABS, Tabs } from '@/components/tabs'
import { Chip, PageHeader, TicketLink } from '@/components/ui'
import { getMe } from '@/lib/auth'
import { loadHolds, runnerAlerts } from '@/lib/asks-server'
import { BLOCK_CODES, BLOCK_LABEL } from '@/lib/automation-loop'
import { casesHref } from '@/lib/case-links'
import { loadAreas } from '@/lib/data'
import { createClient } from '@/lib/supabase/server'
import { HoldForm, LiftHold, ProposalsTable } from './automation-controls'

const STATE: Record<string, { label: string; tone: 'good' | 'accent' | 'warn' | 'crit' | 'muted' }> = {
  idle: { label: 'Idle', tone: 'muted' }, batching: { label: 'Running a batch', tone: 'accent' }, paused_limit: { label: 'Paused at its limit', tone: 'warn' }, cluster_down: { label: 'Cluster down', tone: 'crit' },
}
const ago = (iso: string) => { const m = Math.round((Date.now() - Date.parse(iso)) / 60_000); return m < 60 ? `${m} min ago` : m < 2880 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} days ago` }

/** Automation: the runner, pull requests waiting for review, what blocks cases, proposals and screen holds. */
export default async function AutomationPage() {
  const me = await getMe()
  const lead = me.role === 'lead'
  const supabase = await createClient()
  const [{ data: runners }, { data: events }, { data: prs }, { data: proposals }, holds, alerts, areas, { data: blocked }, { count: thin }] = await Promise.all([
    supabase.from('runner_status').select('state, batch, backlog, since, heartbeat_at, ci_tokens(label)'),
    supabase.from('runner_events').select('kind, batch, detail, at').order('at', { ascending: false }).limit(5),
    supabase.from('automation_prs').select('key, url, title, author, opened_at, reviewer:people(name), pr_cases(case_id)').eq('state', 'open').order('opened_at'),
    supabase.from('test_cases').select('id, tc_id, title, automation_proposed_reason, automation_proposed_at').not('automation_proposed', 'is', null).order('automation_proposed_at'),
    loadHolds(supabase),
    runnerAlerts(supabase),
    loadAreas(),
    supabase.from('test_cases').select('automation_block').eq('automation', 'blocked'),
    supabase.from('test_cases').select('id', { count: 'exact', head: true }).eq('needs_detail', true),
  ])
  const byBlock = new Map<string, number>()
  for (const c of blocked ?? []) byBlock.set(c.automation_block ?? 'none', (byBlock.get(c.automation_block ?? 'none') ?? 0) + 1)
  const one = <T,>(v: unknown) => ((Array.isArray(v) ? v[0] : v) ?? null) as T | null

  return (
    <>
      <Tabs items={CASES_TABS} active="automation" />
      <PageHeader sub="The runner, pull requests waiting for review, what blocks cases, and what needs a lead's decision. What a person must do is on Asks." />

      <section className="card mb-4">
        <header className="flex items-center justify-between border-b border-[var(--line)] px-4 py-2"><h2 className="text-[14px] font-semibold text-[var(--navy-ink)]">Runner</h2>
          {alerts.length > 0 && <span className="text-[12px] font-semibold text-[var(--crit)]">{alerts.map((a) => a.title).join(' · ')}</span>}</header>
        {(runners ?? []).length === 0
          ? <p className="px-4 py-3 text-[12.5px] text-[var(--muted)]">No heartbeat yet. The runner reports with POST /api/runner/heartbeat.</p>
          : (runners ?? []).map((r, i) => (
            <div key={i} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-[13px]">
              <Chip tone={STATE[r.state]?.tone ?? 'muted'}>{STATE[r.state]?.label ?? r.state}</Chip>
              {r.batch && <span>Batch <b className="font-semibold">{r.batch}</b></span>}
              {r.backlog !== null && <span className="text-[var(--muted)]">{r.backlog} cases waiting</span>}
              {r.since && <span className="text-[var(--muted)]">since {ago(r.since)}</span>}
              <span className="ml-auto text-[12px] text-[var(--faint)]">{one<{ label: string }>(r.ci_tokens)?.label} · checked in {ago(r.heartbeat_at)}</span>
            </div>
          ))}
        {(events ?? []).length > 0 && (
          <ul className="border-t border-[var(--line)] px-4 py-2 text-[12px] text-[var(--muted)]">
            {(events ?? []).map((e, i) => <li key={i} className={e.kind === 'batch_failed' ? 'text-[var(--crit)]' : ''}>{ago(e.at)}: {e.kind.replace('batch_', 'batch ')}{e.batch ? ` ${e.batch}` : ''}{e.detail ? `: ${e.detail}` : ''}</li>)}
          </ul>
        )}
      </section>

      <div className="mb-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <section className="card">
          <h2 className="border-b border-[var(--line)] px-4 py-2 text-[14px] font-semibold text-[var(--navy-ink)]">Pull requests waiting · {(prs ?? []).length}</h2>
          <table className="table w-full text-[12.5px]">
            <thead><tr><th>PR</th><th className="text-right">Cases</th><th>Reviewer</th><th className="text-right">Waiting</th></tr></thead>
            <tbody>
              {(prs ?? []).map((p) => {
                const days = Math.floor((Date.now() - Date.parse(p.opened_at)) / 864e5)
                return (
                  <tr key={p.key}>
                    <td>{p.url ? <a href={p.url} target="_blank" rel="noreferrer" className="font-medium text-[var(--accent)] hover:underline">{p.title ?? p.key}</a> : p.title ?? p.key}<span className="ml-2 text-[11px] text-[var(--faint)]">{p.author}</span></td>
                    <td className="text-right tabular-nums">{(p.pr_cases as unknown[] | null)?.length ?? 0}</td>
                    <td>{one<{ name: string }>(p.reviewer)?.name ?? <span className="text-[var(--faint)]">None</span>}</td>
                    <td className={`text-right tabular-nums ${days >= 3 ? 'font-semibold text-[var(--crit)]' : ''}`}>{days} day{days === 1 ? '' : 's'}</td>
                  </tr>
                )
              })}
              {!(prs ?? []).length && <tr><td colSpan={4} className="text-[var(--muted)]">None open. The runner reports them with POST /api/prs.</td></tr>}
            </tbody>
          </table>
        </section>

        <section className="card">
          <h2 className="border-b border-[var(--line)] px-4 py-2 text-[14px] font-semibold text-[var(--navy-ink)]">Why cases are blocked · {(blocked ?? []).length}</h2>
          <ul className="divide-y divide-[var(--row)] text-[13px]">
            {[...BLOCK_CODES, 'none' as const].filter((k) => byBlock.get(k)).map((k) => (
              <li key={k} className="flex justify-between px-4 py-2">
                <span>{k === 'none' ? 'No reason code yet' : BLOCK_LABEL[k]}</span>
                {k === 'none' ? <span className="tabular-nums">{byBlock.get(k)}</span> : <Link href={casesHref({ block: k })} className="font-semibold text-[var(--accent)] hover:underline">{byBlock.get(k)}</Link>}
              </li>
            ))}
            <li className="flex justify-between px-4 py-2"><span>Expected result is a placeholder</span><Link href={casesHref({ needs_detail: '1' })} className="font-semibold text-[var(--accent)] hover:underline">{thin ?? 0}</Link></li>
          </ul>
        </section>
      </div>

      <section id="proposals" className="card mb-4 scroll-mt-20">
        <h2 className="border-b border-[var(--line)] px-4 py-2 text-[14px] font-semibold text-[var(--navy-ink)]">Proposed as not automatable · {(proposals ?? []).length}</h2>
        <ProposalsTable rows={(proposals ?? []).map((p) => ({ id: p.id, tc_id: p.tc_id, title: p.title, reason: p.automation_proposed_reason }))} isLead={lead} />
      </section>

      <section className="card">
        <h2 className="border-b border-[var(--line)] px-4 py-2 text-[14px] font-semibold text-[var(--navy-ink)]">Screens on hold</h2>
        <table className="table w-full text-[12.5px]">
          <thead><tr><th>Page</th><th>Until</th><th>Reason</th><th>State</th>{lead && <th />}</tr></thead>
          <tbody>
            {holds.map((h) => (
              <tr key={h.id}>
                <td>{h.zone} · {h.page}</td>
                <td>{h.defect ? <>{<TicketLink k={h.defect} />} closes</> : null}{h.defect && h.until ? ', or ' : ''}{h.until ?? ''}</td>
                <td>{h.reason ?? ''}</td>
                <td><Chip tone={h.active ? 'warn' : 'muted'}>{h.active ? 'On hold' : 'Lifted'}</Chip></td>
                {lead && <td><LiftHold areaId={h.id} /></td>}
              </tr>
            ))}
            {!holds.length && <tr><td colSpan={lead ? 5 : 4} className="text-[var(--muted)]">No screen is on hold.</td></tr>}
          </tbody>
        </table>
        {lead && <HoldForm pages={areas.filter((a) => a.in_release !== false).map((a) => ({ id: a.id, label: `${a.zone} · ${a.page}` }))} />}
      </section>
    </>
  )
}
