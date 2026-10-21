import { sprintHref } from '@/lib/links'
import Link from 'next/link'
import { LineChart } from '@/components/charts/line-chart'
import { ReleaseDateButton } from '@/components/release-controls'
import { ScheduleLog } from '@/components/schedule-log'
import { getMe } from '@/lib/auth'
import { RELEASE_TABS, Tabs } from '@/components/tabs'
import { PageHeader, Stat } from '@/components/ui'
import {
  runningSprints, loadRelease, loadScheduleChanges, daysUntil, fmtDate,
  loadAreas, loadCases, loadManualRuns, loadSprints, loadTasks, loadTicketEvents, loadTickets, toStageInput,
} from '@/lib/data'
import { casesTestedByDay, openTicketsByDay } from '@/lib/trends'
import { mismatch, needsTicket } from '@/lib/workflow/case-stage'
import { OPEN_STATES } from '@/lib/workflow/ticket-machine'

const TREND_FROM = '2026-10-08' // first tickets were logged on 8 Oct

/** The executive view: is 26.111 going to make it, and what is in the way. */
export default async function ReleasePage() {
  const me = await getMe()
  const [areas, cases, tickets, sprints, tasks, events, manualRuns, release, changes] = await Promise.all([
    loadAreas(), loadCases(), loadTickets(), loadSprints(), loadTasks(), loadTicketEvents(), loadManualRuns(), loadRelease(), loadScheduleChanges(),
  ])
  const RELEASE_DATE = release.release_on
  const slipped = daysUntil(release.release_on) - daysUntil(release.original_release_on)
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10)
  const running = runningSprints(sprints)

  // Release bar
  const open = tickets.filter((t) => OPEN_STATES.includes(t.state))
  const openCrit = open.filter((t) => t.severity === 'Critical').length
  const openHigh = open.filter((t) => t.severity === 'High').length
  const high = cases.filter((c) => c.priority === 'Critical' || c.priority === 'High')
  const highRun = high.filter((c) => c.manual_result)
  const highPass = highRun.filter((c) => c.manual_result === 'passed').length
  const highPassRate = highRun.length ? Math.round((highPass / highRun.length) * 100) : 0
  const mismatches = cases.filter((c) => mismatch(c.auto_result, c.manual_result)).length
  const untracked = cases.filter((c) => needsTicket(toStageInput(c))).length
  const areasWithPass = new Set(cases.filter((c) => (c.manual_result ?? c.auto_result) === 'passed').map((c) => c.area_id)).size
  const bar = [
    { label: 'No open Critical tickets', ok: openCrit === 0, detail: `${openCrit} open` },
    { label: 'High tickets closed or worked around', ok: openHigh === 0, detail: `${openHigh} open` },
    { label: 'Critical/High cases run manually, 90% passing', ok: highRun.length === high.length && highPassRate >= 90, detail: `${highRun.length} of ${high.length} run · ${highPassRate}% passing` },
    { label: 'Every area has a passing case', ok: areasWithPass === areas.length, detail: `${areasWithPass} of ${areas.length} areas` },
    { label: 'Every failure has a ticket', ok: untracked === 0, detail: `${untracked} untracked` },
    { label: 'Automation agrees with manual testing', ok: mismatches === 0, detail: `${mismatches} mismatches` },
  ]
  const met = bar.filter((b) => b.ok).length
  const lateTasks = tasks.filter((t) => t.status !== 'done' && t.due_on < today)
  const doneTasks = tasks.filter((t) => t.status === 'done').length
  const daysLeft = daysUntil(RELEASE_DATE)
  const verdict =
    met === bar.length ? { label: 'Ready', tone: 'good' as const, why: 'Every release check is met.' }
    : lateTasks.length > 5 || (daysLeft < 10 && openCrit > 0) ? { label: 'Off track', tone: 'crit' as const, why: `${openCrit} Critical tickets open and ${lateTasks.length} plan tasks late with ${daysLeft} days to go.` }
    : { label: 'At risk', tone: 'warn' as const, why: `${met} of ${bar.length} release checks met; ${openCrit} Critical and ${openHigh} High tickets still open.` }

  // Trends
  const openTrend = openTicketsByDay(tickets, events, ['Critical', 'High'], TREND_FROM, today)
  const testedTrend = casesTestedByDay(manualRuns, TREND_FROM, today)

  // Readiness by zone
  const zones = [...new Set(areas.map((a) => a.zone))].map((zone) => {
    const zc = cases.filter((c) => c.zone === zone)
    const latest = (c: (typeof cases)[number]) => c.manual_result ?? c.auto_result
    const passed = zc.filter((c) => latest(c) === 'passed').length
    const failed = zc.filter((c) => latest(c) === 'failed').length
    const zt = open.filter((t) => t.zone === zone)
    return {
      zone, total: zc.length, passed, failed, rest: zc.length - passed - failed,
      blocking: zt.filter((t) => t.severity === 'Critical' || t.severity === 'High').length,
      areas: areas.filter((a) => a.zone === zone).length,
      areasWithCases: new Set(zc.map((c) => c.area_id)).size,
    }
  })

  // Plan by phase
  const phases = [...new Set(tasks.map((t) => t.phase))].map((phase) => {
    const pt = tasks.filter((t) => t.phase === phase)
    return {
      phase, total: pt.length, done: pt.filter((t) => t.status === 'done').length,
      blocked: pt.filter((t) => t.status === 'blocked').length,
      late: pt.filter((t) => t.status !== 'done' && t.due_on < today).length,
      due: pt.reduce((m, t) => (t.due_on > m ? t.due_on : m), ''),
    }
  })

  // Sprint timeline, laid out by calendar days
  const first = [sprints[0]?.starts_on ?? today, today].sort()[0]
  const lastDay = RELEASE_DATE
  const span = Math.max(1, (Date.parse(lastDay) - Date.parse(first)) / 864e5 + 1)
  const pos = (d: string) => ((Date.parse(d) - Date.parse(first)) / 864e5 / span) * 100

  const toneText = { good: 'text-[var(--good)]', warn: 'text-[var(--warn)]', crit: 'text-[var(--crit)]' }
  const toneChip = {
    good: 'border-[var(--good-line)] bg-[var(--good-soft)] text-[var(--good)]',
    warn: 'border-[var(--warn-line)] bg-[var(--warn-soft)] text-[var(--warn)]',
    crit: 'border-[var(--crit-line)] bg-[var(--crit-soft)] text-[var(--crit)]',
  }

  return (
    <>
      <Tabs items={RELEASE_TABS} active="overview" />
      <PageHeader sub={`Ships ${fmtDate(release.release_on)} · go/no-go ${fmtDate(release.go_no_go_on)}`}>
        {me.role === 'lead' && <ReleaseDateButton release_on={release.release_on} go_no_go_on={release.go_no_go_on} />}
      </PageHeader>

      {/* Verdict */}
      <section className="card mb-4 flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4">
        <span className={`chip h-7 px-3 text-[13px] ${toneChip[verdict.tone]}`}>{verdict.label}</span>
        <p className="min-w-0 flex-1 text-[14px] text-[var(--ink)]">{verdict.why}</p>
        <span className="mono text-[12px] text-[var(--muted)]">
          {daysLeft} days to release · {running.length ? `${running.map((r) => r.name).join(' and ')} running` : 'no sprint running'}
          {slipped !== 0 && <b className={slipped > 0 ? 'ml-2 text-[var(--crit)]' : 'ml-2 text-[var(--good)]'}>{slipped > 0 ? `slipped ${slipped} days` : `pulled in ${-slipped} days`}</b>}
        </span>
      </section>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="Release checks met" value={`${met}/${bar.length}`} tone={met === bar.length ? 'good' : 'warn'} />
        <Stat label="Open Critical" value={openCrit} tone={openCrit ? 'crit' : 'good'} sub={`${openHigh} High also open`} />
        <Stat label="Crit/High pass rate" value={`${highPassRate}%`} sub={`${highRun.length} of ${high.length} run manually`} tone={highPassRate >= 90 ? 'good' : 'warn'} />
        <Stat label="Cases tested" value={`${Math.round((cases.filter((c) => c.manual_result).length / Math.max(cases.length, 1)) * 100)}%`} sub={`${cases.filter((c) => c.manual_result).length} of ${cases.length} manually`} />
        <Stat label="Areas with cases" value={`${new Set(cases.map((c) => c.area_id)).size}/${areas.length}`} sub="Framework areas covered" />
        <Stat label="Plan tasks" value={`${doneTasks}/${tasks.length}`} sub={lateTasks.length ? `${lateTasks.length} late` : 'none late'} tone={lateTasks.length ? 'crit' : 'good'} />
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
        <section className="card px-4 pt-3 pb-2">
          <h3 className="text-[14px] font-semibold text-[var(--navy-ink)]">Open Critical and High tickets</h3>
          <LineChart points={openTrend} label="Open Critical and High tickets" unit="open" target={{ value: 0, label: 'goal' }} />
        </section>
        <section className="card px-4 pt-3 pb-2">
          <h3 className="text-[14px] font-semibold text-[var(--navy-ink)]">Test cases tested manually</h3>
          <LineChart points={testedTrend} label="Test cases tested manually" unit="cases" target={{ value: cases.length, label: 'all' }} />
        </section>
      </div>

      <div className="mb-4 grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section className="card">
          <header className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--line)] px-4 py-2.5">
            <h3 className="text-[14px] font-semibold text-[var(--navy-ink)]">Readiness by zone</h3>
            <span className="flex items-center gap-3 text-[11.5px] text-[var(--muted)]">
              <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 bg-[#2b57c4]" />Passed</span>
              <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 bg-[#d03b3b]" />Failed</span>
              <span className="flex items-center gap-1"><span className="inline-block h-2.5 w-2.5 bg-[#dfe3ea]" />Not passed yet</span>
            </span>
          </header>
          <ul className="divide-y divide-[var(--row)]">
            {zones.map((z) => (
              <li key={z.zone} className="grid grid-cols-[9rem_minmax(0,1fr)_7rem] items-center gap-3 px-4 py-2.5">
                <div>
                  <Link href="/areas" className="text-[13px] font-semibold text-[var(--ink)] hover:underline">{z.zone}</Link>
                  <div className="text-[11px] text-[var(--faint)]">{z.areasWithCases} of {z.areas} areas have cases</div>
                </div>
                {z.total ? (
                  <div className="flex h-3.5 gap-[2px]" role="img" aria-label={`${z.zone}: ${z.passed} passed, ${z.failed} failed, ${z.rest} not passed yet, of ${z.total}`}>
                    {z.passed > 0 && <div title={`Passed: ${z.passed}`} className="rounded-l-[4px] bg-[#2b57c4]" style={{ width: `${(z.passed / z.total) * 100}%` }} />}
                    {z.failed > 0 && <div title={`Failed: ${z.failed}`} className="bg-[#d03b3b]" style={{ width: `${(z.failed / z.total) * 100}%` }} />}
                    {z.rest > 0 && <div title={`Not passed yet: ${z.rest}`} className="rounded-r-[4px] bg-[#dfe3ea]" style={{ width: `${(z.rest / z.total) * 100}%` }} />}
                  </div>
                ) : <div className="text-[12px] text-[var(--faint)]">No test cases yet</div>}
                <div className="text-right text-[12px]">
                  <span className="mono text-[var(--ink-2)]">{z.passed}/{z.total}</span>
                  {z.blocking > 0 && <span className={`ml-2 font-semibold ${toneText.crit}`}>{z.blocking} C/H</span>}
                </div>
              </li>
            ))}
          </ul>
        </section>

        <section className="card">
          <h3 className="border-b border-[var(--line)] px-4 py-2.5 text-[14px] font-semibold text-[var(--navy-ink)]">Release checks</h3>
          <ul className="divide-y divide-[var(--row)]">
            {bar.map((b) => (
              <li key={b.label} className="flex items-start gap-2.5 px-4 py-2.5 text-[13px]">
                <span aria-hidden className={`mt-px font-semibold ${b.ok ? toneText.good : toneText.crit}`}>{b.ok ? '✓' : '✗'}</span>
                <span className="flex-1">{b.label}</span>
                <span className="text-[12px] text-[var(--muted)]">{b.detail}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <section className="card">
          <header className="flex items-center justify-between border-b border-[var(--line)] px-4 py-2.5">
            <h3 className="text-[14px] font-semibold text-[var(--navy-ink)]">Sprints to release</h3>
            <Link href="/sprints" className="text-[12px] text-[var(--accent)] hover:underline">All sprints</Link>
          </header>
          <div className="px-4 py-4">
            <div className="relative h-14">
              {sprints.map((s) => (
                <Link key={s.id} href={sprintHref(s)} title={`${s.name}: ${fmtDate(s.starts_on)} to ${fmtDate(s.ends_on)}${s.goal ? ` · ${s.goal}` : ''}`}
                  className={`absolute top-0 flex h-8 items-center justify-center border text-[11px] font-semibold ${
                    s.status === 'closed' ? 'border-[var(--navy)] bg-[var(--navy)] text-white'
                    : s.status === 'active' ? 'border-[var(--navy)] bg-[var(--accent-soft)] text-[var(--navy)]'
                    : 'border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink-2)]'}`}
                  style={{ left: `${pos(s.starts_on)}%`, width: `calc(${pos(s.ends_on) - pos(s.starts_on) + 100 / span}% - 2px)` }}>
                  {s.name}
                </Link>
              ))}
              <div className="absolute top-0 h-11 w-0.5 bg-[#d03b3b]" style={{ left: `${Math.min(100, Math.max(0, pos(today)))}%` }} title={`Today, ${fmtDate(today)}`} />
              <div className="absolute top-0 h-11 w-0.5 bg-[var(--navy-ink)]" style={{ left: 'calc(100% - 2px)' }} title={`Release, ${fmtDate(RELEASE_DATE)}`} />
              <div className="mono absolute top-9 left-0 text-[10.5px] text-[var(--faint)]">{fmtDate(first)}</div>
              <div className="mono absolute top-9 right-0 text-[10.5px] text-[var(--faint)]">Release {fmtDate(RELEASE_DATE)}</div>
            </div>
            <p className="mt-1 text-[11.5px] text-[var(--muted)]"><span className="inline-block h-2.5 w-0.5 bg-[#d03b3b] align-middle" /> today · dark = closed · outlined = running · grey = planned</p>
          </div>
        </section>

        <section className="card">
          <header className="flex items-center justify-between border-b border-[var(--line)] px-4 py-2.5">
            <h3 className="text-[14px] font-semibold text-[var(--navy-ink)]">Plan by phase</h3>
            <Link href="/plan" className="text-[12px] text-[var(--accent)] hover:underline">Open plan</Link>
          </header>
          <table className="table">
            <thead><tr><th>Phase</th><th className="text-right">Done</th><th className="text-right">Late</th><th className="text-right">Blocked</th><th>Ends</th></tr></thead>
            <tbody>
              {phases.map((p) => (
                <tr key={p.phase}>
                  <td className="font-medium text-[var(--ink)]">{p.phase}</td>
                  <td className="text-right tabular-nums">{p.done}/{p.total}</td>
                  <td className={`text-right tabular-nums ${p.late ? 'font-semibold text-[var(--crit)]' : ''}`}>{p.late || '·'}</td>
                  <td className={`text-right tabular-nums ${p.blocked ? 'font-semibold text-[var(--warn)]' : ''}`}>{p.blocked || '·'}</td>
                  <td className="mono text-[12px]">{fmtDate(p.due)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
      <ScheduleLog changes={changes} release={release} limit={6} />
    </>
  )
}
