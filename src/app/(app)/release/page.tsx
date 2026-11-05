import { LineChart } from '@/components/charts/line-chart'
import { RELEASE_TABS, Tabs } from '@/components/tabs'
import { HEALTH_LABEL, summarizeArea } from '@/lib/areas'
import {
  runningSprints, loadRelease, daysUntil, fmtDate,
  loadAreas, loadCases, loadManualRuns, loadSprintAreas, loadSprints, loadTicketEvents, loadTickets, toStageInput,
} from '@/lib/data'
import { caseOutcome, pageProgress, pageStatus } from '@/lib/progress'
import { casesTestedByDay, openTicketsByDay } from '@/lib/trends'
import { mismatch, needsManual, needsTicket } from '@/lib/workflow/case-stage'
import { fixSprintForArea } from '@/lib/workflow/fix-sprint'
import { OPEN_STATES } from '@/lib/workflow/ticket-machine'
import { StatusGrid, type StatusRow } from './status-grid'

const TREND_FROM = '2026-10-08' // first tickets were logged on 8 Oct

/** Is 26.111 going to make it, and what is in the way: the verdict, its checks and trends, then every page. */
export default async function ReleasePage() {
  const [allAreas, allCases, tickets, sprints, sprintAreas, events, manualRuns, release] = await Promise.all([
    loadAreas(), loadCases(), loadTickets(), loadSprints(), loadSprintAreas(), loadTicketEvents(), loadManualRuns(), loadRelease(),
  ])
  const slipped = daysUntil(release.release_on) - daysUntil(release.original_release_on)
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10)
  const running = runningSprints(sprints)

  // Only what is in this release counts.
  const areas = allAreas.filter((a) => a.in_release !== false)
  const pageIds = new Set(areas.map((a) => a.id))
  const cases = allCases.filter((c) => pageIds.has(c.area_id))

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
  const pagesWithPass = new Set(cases.filter((c) => caseOutcome(c) === 'passed').map((c) => c.area_id)).size
  const bar = [
    { label: 'No open Critical tickets', ok: openCrit === 0, detail: `${openCrit} open` },
    { label: 'High tickets closed or worked around', ok: openHigh === 0, detail: `${openHigh} open` },
    { label: 'Critical/High cases run manually, 90% passing', ok: highRun.length === high.length && highPassRate >= 90, detail: `${highRun.length} of ${high.length} run · ${highPassRate}% passing` },
    { label: 'Every page has a passing case', ok: pagesWithPass === areas.length, detail: `${pagesWithPass} of ${areas.length} pages` },
    { label: 'Every failure has a ticket', ok: untracked === 0, detail: `${untracked} untracked` },
    { label: 'Automation agrees with manual testing', ok: mismatches === 0, detail: `${mismatches} mismatches` },
  ]
  const met = bar.filter((b) => b.ok).length
  const daysLeft = daysUntil(release.release_on)
  const verdict =
    met === bar.length ? { label: 'Ready', tone: 'good' as const, why: 'Every release check is met.' }
    : daysLeft < 10 && openCrit > 0 ? { label: 'Off track', tone: 'crit' as const, why: `${openCrit} Critical tickets open with ${daysLeft} days to go.` }
    : { label: 'At risk', tone: 'warn' as const, why: `${met} of ${bar.length} release checks met; ${openCrit} Critical and ${openHigh} High tickets still open.` }

  // Trends. Tested by hand counts the cases that need a person, as the Tested by hand card does.
  const openTrend = openTicketsByDay(tickets, events, ['Critical', 'High'], TREND_FROM, today)
  const needHand = cases.filter((c) => needsManual({ ...c, open_fix: 0, awaiting_retest: 0 }))
  const needHandIds = new Set(needHand.map((c) => c.id))
  const testedTrend = casesTestedByDay(manualRuns.filter((r) => needHandIds.has(r.case_id)), TREND_FROM, today)

  // Every page
  const rows: StatusRow[] = pageProgress(areas, cases, today).map((p) => {
    const mine = tickets.filter((t) => t.area_id === p.id)
    const openHere = mine.filter((t) => OPEN_STATES.includes(t.state))
    const critical = openHere.filter((t) => t.severity === 'Critical').length
    const highHere = openHere.filter((t) => t.severity === 'High').length
    const s = pageStatus(p)
    return {
      ...p, id: p.id, zone: p.zone, page: p.page,
      sprint: fixSprintForArea(p.id, sprints, sprintAreas)?.name ?? '',
      status: HEALTH_LABEL[summarizeArea(cases.filter((c) => c.area_id === p.id), mine).health],
      automation: s.automation, hand: s.hand,
      open: openHere.length, critical, high: highHere,
      tickets: critical ? 'Critical open' : highHere ? 'High open' : openHere.length ? 'Others open' : 'None open',
    }
  })
  const noPage = open.filter((t) => !t.area_id || !pageIds.has(t.area_id))

  const toneText = { good: 'text-[var(--good)]', crit: 'text-[var(--crit)]' }
  const toneChip = {
    good: 'border-[var(--good-line)] bg-[var(--good-soft)] text-[var(--good)]',
    warn: 'border-[var(--warn-line)] bg-[var(--warn-soft)] text-[var(--warn)]',
    crit: 'border-[var(--crit-line)] bg-[var(--crit-soft)] text-[var(--crit)]',
  }

  return (
    <>
      <Tabs items={RELEASE_TABS} active="status" />

      {/* Verdict */}
      <section className="card mb-3 flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-3">
        <span className={`chip h-7 px-3 text-[13px] ${toneChip[verdict.tone]}`}>{verdict.label}</span>
        <p className="min-w-0 flex-1 text-[14px] text-[var(--ink)]">{verdict.why}</p>
        <span className="mono text-[12px] text-[var(--muted)]">
          Ships {fmtDate(release.release_on)} · go/no-go {fmtDate(release.go_no_go_on)} · {daysLeft} days · {running.length ? `${running.map((r) => r.name).join(' and ')} running` : 'no sprint running'}
          {slipped !== 0 && <b className={slipped > 0 ? 'ml-2 text-[var(--crit)]' : 'ml-2 text-[var(--good)]'}>{slipped > 0 ? `slipped ${slipped} days` : `pulled in ${-slipped} days`}</b>}
        </span>
      </section>

      <div className="mb-4 grid grid-cols-1 gap-3 xl:grid-cols-3">
        <section className="card">
          <h3 className="border-b border-[var(--line)] px-4 py-2 text-[14px] font-semibold text-[var(--navy-ink)]">Release checks</h3>
          <ul className="divide-y divide-[var(--row)]">
            {bar.map((b) => (
              <li key={b.label} className="flex items-start gap-2.5 px-4 py-1.5 text-[12.5px]">
                <span aria-hidden className={`mt-px font-semibold ${b.ok ? toneText.good : toneText.crit}`}>{b.ok ? '✓' : '✗'}</span>
                <span className="flex-1">{b.label}</span>
                <span className="text-right text-[12px] text-[var(--muted)]">{b.detail}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="card px-4 pt-2.5 pb-1">
          <h3 className="text-[14px] font-semibold text-[var(--navy-ink)]">Open Critical and High tickets</h3>
          <LineChart points={openTrend} label="Open Critical and High tickets" unit="open" target={{ value: 0, label: 'goal' }} height={210} />
        </section>
        <section className="card px-4 pt-2.5 pb-1">
          <h3 className="text-[14px] font-semibold text-[var(--navy-ink)]">Cases tested by hand, of those that need it</h3>
          <LineChart points={testedTrend} label="Cases tested by hand" unit="cases" target={{ value: needHand.length, label: 'all' }} height={210} />
        </section>
      </div>

      <StatusGrid rows={rows} noPage={{
        open: noPage.length,
        critical: noPage.filter((t) => t.severity === 'Critical').length,
        high: noPage.filter((t) => t.severity === 'High').length,
      }} />
    </>
  )
}
