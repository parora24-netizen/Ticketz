import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CASES_TABS, Tabs } from '@/components/tabs'
import { CaseLink, Chip, PageHeader, TicketLink } from '@/components/ui'
import { countsByPage, delta, notTestedReasons, slowest, waitsBySite } from '@/lib/runs'
import { EXIT, hm, secs, when } from '@/lib/runs-format'
import { getRun, previousFullRun, runResults } from '@/lib/runs-server'
import { createClient } from '@/lib/supabase/server'

const PHASE_TONE: Record<string, string> = { ok: 'bg-[#2b57c4]', failed: 'bg-[#d03b3b]', cut: 'bg-[#d08a1f]', skipped: 'bg-[#c7ccd6]' }
const SITE_LABEL: Record<string, string> = { landing_settle: 'Landing settles', engine_open: 'Engine opens', toast: 'Toast', create: 'Create', sign_in: 'Sign in', connection_check: 'Connection check', pool_claim: 'Pool claim' }

/** One run, to drill into: how it went, its phases, what failed and why, what was slow, and what changed since the last full run. */
export default async function RunPage({ params }: { params: Promise<{ runId: string }> }) {
  const runId = decodeURIComponent((await params).runId)
  const supabase = await createClient()
  const run = await getRun(supabase, runId)
  if (!run) notFound()
  const [results, { data: phases }, prev] = await Promise.all([
    runResults(supabase, runId),
    supabase.from('run_phases').select('phase, at, duration_s, outcome, detail').eq('run_id', runId).order('at'),
    previousFullRun(supabase, run),
  ])
  const waits: { site: string; ms: number }[] = []
  for (let from = 0; ; from += 1000) {
    const { data } = await supabase.from('run_waits').select('site, ms').eq('run_id', runId).range(from, from + 999)
    waits.push(...(data ?? []))
    if ((data ?? []).length < 1000) break
  }
  const prevResults = prev ? await runResults(supabase, prev.run_id) : []
  const d = prev ? delta(results, prevResults) : null
  const failures = results.filter((r) => r.result === 'failed' || r.result === 'known_defect')
  const failIds = failures.map((r) => r.tc_id)
  const { data: tix } = failIds.length ? await supabase.from('ticket_list').select('key, state, tc_id').in('tc_id', failIds).in('state', ['new', 'triaged', 'in_fix', 'reopened', 'ready_for_retest']) : { data: [] }
  const ticketOf = new Map((tix ?? []).map((t) => [t.tc_id as string, t.key as string]))
  const byPage = countsByPage(results)
  const reasons = notTestedReasons(results)
  const slow = slowest(results)
  const sites = waitsBySite(waits)
  const phaseTotal = (phases ?? []).reduce((n, p) => n + Number(p.duration_s ?? 0), 0)
  const passed = results.filter((r) => r.result === 'passed').length
  const wall = run.wall_min ?? (run.finished_at && run.recorded ? (Date.parse(run.finished_at) - Date.parse(run.started_at)) / 60000 : null)
  const running = run.recorded && !run.finished_at
  const late = running && run.eta && run.eta < new Date().toISOString()
  const Section = ({ title, children }: { title: React.ReactNode; children: React.ReactNode }) => (
    <section className="card mb-4"><h2 className="border-b border-[var(--line)] px-4 py-2 text-[14px] font-semibold text-[var(--navy-ink)]">{title}</h2>{children}</section>
  )

  return (
    <>
      <Tabs items={CASES_TABS} active="runs" />
      <PageHeader title={run.run_id} sub={<>{run.kind} run · started {when(run.started_at)}{run.finished_at && run.recorded ? ` · ended ${when(run.finished_at)}` : ''}{run.launcher ? ` · ${run.launcher}` : ''} · <Link href="/cases/runs" className="text-[var(--accent)] hover:underline">all runs</Link></>}>
        {running ? <Chip tone={late ? 'warn' : 'accent'}>{late ? 'Running past its expected end' : 'Running'}</Chip> : run.exit ? <Chip tone={EXIT[run.exit]?.tone ?? 'muted'}>{EXIT[run.exit]?.label ?? run.exit}</Chip> : null}
        {run.confounded && <Chip tone="warn">Bundle changed mid-run</Chip>}
      </PageHeader>

      <section className="card mb-4 grid grid-cols-2 gap-x-6 gap-y-2 px-4 py-3 text-[12.5px] sm:grid-cols-4 lg:grid-cols-6">
        {([
          ['Tests', `${results.length || run.tests_done || 0}${run.tests_planned ? ` of ${run.tests_planned}` : ''}`],
          ['Passed', `${passed}${results.length ? ` (${Math.round((passed / results.length) * 100)}%)` : ''}`],
          ['Failed', String(results.filter((r) => r.result === 'failed').length)],
          ['Known defect', String(results.filter((r) => r.result === 'known_defect').length)],
          ['Not tested', String(results.filter((r) => r.result === 'skipped').length)],
          ['Wall time', hm(wall)], ['Worker time', hm(run.worker_min)], ['Workers', String(run.workers ?? '—')],
          ['Branch · commit', [run.branch, run.commit].filter(Boolean).join(' · ') || '—'],
          ['Bundle', run.bundle_end && run.bundle_end !== run.bundle ? `${run.bundle} → ${run.bundle_end}` : run.bundle ?? '—'],
          ['Target', run.target ?? '—'], ['ETA', run.eta ? when(run.eta) : '—'],
          ['Creates failed', String(run.creates_failed ?? '—')], ['Rate-limit waits', String(run.rate_limit_waits ?? '—')], ['HTTP 503', String(run.http_503 ?? '—')], ['Lock waits', run.lock_wait_min != null ? `${run.lock_wait_min} min` : '—'],
        ] as [string, string][]).map(([k, v]) => <div key={k}><div className="label">{k}</div><div className="mono mt-0.5 break-all">{v}</div></div>)}
      </section>

      {(phases ?? []).length > 0 && (
        <Section title="Phases">
          <div className="flex h-7 w-full overflow-hidden px-4 pt-3" role="img" aria-label="Phases by time">
            {(phases ?? []).map((p, i) => <div key={i} title={`${p.phase}: ${secs(Number(p.duration_s ?? 0) * 1000)} · ${p.outcome}`} className={`${PHASE_TONE[p.outcome] ?? 'bg-[#c7ccd6]'} border-r border-white`} style={{ width: `${phaseTotal ? (Number(p.duration_s ?? 0) / phaseTotal) * 100 : 100 / (phases ?? []).length}%` }} />)}
          </div>
          <table className="table mt-2 w-full text-[12.5px]">
            <thead><tr><th>Phase</th><th>At</th><th className="text-right">Took</th><th>Outcome</th><th>Detail</th></tr></thead>
            <tbody>{(phases ?? []).map((p, i) => <tr key={i}><td className="mono">{p.phase}</td><td className="mono whitespace-nowrap">{when(p.at)}</td><td className="text-right tabular-nums">{secs(Number(p.duration_s ?? 0) * 1000)}</td><td><Chip tone={p.outcome === 'ok' ? 'good' : p.outcome === 'failed' ? 'crit' : p.outcome === 'cut' ? 'warn' : 'muted'}>{p.outcome}</Chip></td><td>{p.detail}</td></tr>)}</tbody>
          </table>
        </Section>
      )}

      {d && prev && (
        <Section title={<>Since the previous full run <Link href={`/cases/runs/${encodeURIComponent(prev.run_id)}`} className="mono font-normal text-[var(--accent)] hover:underline">{prev.run_id}</Link></>}>
          <div className="grid gap-4 px-4 py-3 text-[12.5px] md:grid-cols-3">
            <div><div className="label">New failures · {d.newFailures.length}</div><div className="mt-1 flex flex-wrap gap-1.5">{d.newFailures.slice(0, 60).map((t) => <CaseLink key={t} tcId={t} />)}</div></div>
            <div><div className="label">Fixed since · {d.fixed.length}</div><div className="mt-1 flex flex-wrap gap-1.5">{d.fixed.slice(0, 60).map((t) => <CaseLink key={t} tcId={t} />)}</div></div>
            <div><div className="label">Much slower · {d.slower.length}</div><ul className="mt-1 space-y-0.5">{d.slower.slice(0, 10).map((s) => <li key={s.tc_id}><CaseLink tcId={s.tc_id} /> {secs(s.before)} → {secs(s.now)}</li>)}</ul></div>
          </div>
        </Section>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Section title={`Failures · ${failures.length}`}>
          <ul className="max-h-[480px] divide-y divide-[var(--row)] overflow-y-auto text-[12.5px]">
            {failures.map((r) => (
              <li key={r.tc_id} className="px-4 py-2">
                <div className="flex flex-wrap items-center gap-2"><CaseLink tcId={r.tc_id} /><span className="text-[var(--muted)]">{r.zone} · {r.page}</span>
                  {r.result === 'known_defect' && <Chip tone="warn">Known defect{r.defect_id ? ` ${r.defect_id}` : ''}</Chip>}{r.outcome === 'timed_out' && <Chip tone="crit">Timed out</Chip>}
                  {ticketOf.get(r.tc_id) && <span className="ml-auto"><TicketLink k={ticketOf.get(r.tc_id)!} /></span>}</div>
                <p className="mt-0.5 line-clamp-2 text-[12px] text-[var(--ink-2)]">{r.error_head ?? r.note?.split('\n')[0] ?? r.title}</p>
              </li>
            ))}
            {!failures.length && <li className="px-4 py-3 text-[var(--muted)]">Nothing failed.</li>}
          </ul>
        </Section>
        <Section title={`Not tested · ${results.filter((r) => r.result === 'skipped').length}`}>
          <ul className="max-h-[480px] divide-y divide-[var(--row)] overflow-y-auto text-[12.5px]">
            {reasons.map((x) => <li key={x.reason} className="flex gap-3 px-4 py-2"><span className="tabular-nums font-semibold">{x.n}</span><span>{x.reason}</span></li>)}
            {!reasons.length && <li className="px-4 py-3 text-[var(--muted)]">Every test ran.</li>}
          </ul>
        </Section>
        <Section title="Slowest tests">
          <table className="table w-full text-[12.5px]"><tbody>{slow.map((r) => <tr key={r.tc_id}><td><CaseLink tcId={r.tc_id} /></td><td className="text-[var(--muted)]">{r.zone} · {r.page}</td><td className="text-right tabular-nums">{secs(r.duration_ms)}</td></tr>)}</tbody></table>
          {!slow.length && <p className="px-4 py-3 text-[12.5px] text-[var(--muted)]">No durations posted.</p>}
        </Section>
        <Section title="Waits by site">
          <table className="table w-full text-[12.5px]">
            <thead><tr><th>Site</th><th className="text-right">Waits</th><th className="text-right">Median</th><th className="text-right">95%</th><th className="text-right">Worst</th><th className="text-right">Total</th></tr></thead>
            <tbody>{sites.map((s) => <tr key={s.site}><td>{SITE_LABEL[s.site] ?? s.site}</td><td className="text-right tabular-nums">{s.n}</td><td className="text-right tabular-nums">{secs(s.p50)}</td><td className="text-right tabular-nums">{secs(s.p95)}</td><td className="text-right tabular-nums">{secs(s.max)}</td><td className="text-right tabular-nums">{secs(s.total)}</td></tr>)}</tbody>
          </table>
          {!sites.length && <p className="px-4 py-3 text-[12.5px] text-[var(--muted)]">No waits posted for this run.</p>}
        </Section>
      </div>

      <Section title="By page">
        <table className="table w-full text-[12.5px]">
          <thead><tr><th>Zone</th><th>Page</th><th className="text-right">Tests</th><th className="text-right">Passed</th><th className="text-right">Failed</th><th className="text-right">Known defect</th><th className="text-right">Not tested</th></tr></thead>
          <tbody>{byPage.map((p) => <tr key={`${p.zone}${p.page}`}><td>{p.zone}</td><td>{p.page}</td><td className="text-right tabular-nums">{p.total}</td><td className="text-right tabular-nums">{p.passed}</td><td className={`text-right tabular-nums ${p.failed ? 'font-semibold text-[var(--crit)]' : ''}`}>{p.failed}</td><td className="text-right tabular-nums">{p.known_defect}</td><td className="text-right tabular-nums">{p.not_tested}</td></tr>)}</tbody>
        </table>
      </Section>
    </>
  )
}
