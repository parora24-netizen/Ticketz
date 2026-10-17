import Link from 'next/link'
import { Bar, PageHeader, Stat } from '@/components/ui'
import { HEALTH_CLASS, HEALTH_LABEL, summarizeArea } from '@/lib/areas'
import {
  GO_NO_GO_DATE, RELEASE_DATE, currentSprint, daysUntil, fmtDate,
  loadAreas, loadCases, loadSprintAreas, loadSprintRuns, loadSprints, loadTickets, toStageInput,
} from '@/lib/data'
import { mismatch, needsTicket } from '@/lib/workflow/case-stage'
import { sprintGate } from '@/lib/workflow/sprint-gate'
import { OPEN_STATES, STATE_LABEL, type TicketState } from '@/lib/workflow/ticket-machine'

export default async function ReleasePage() {
  const [areas, cases, tickets, sprints, sprintAreas] = await Promise.all([
    loadAreas(), loadCases(), loadTickets(), loadSprints(), loadSprintAreas(),
  ])
  const sprint = currentSprint(sprints)

  const open = tickets.filter((t) => OPEN_STATES.includes(t.state))
  const openCrit = open.filter((t) => t.severity === 'Critical').length
  const openHigh = open.filter((t) => t.severity === 'High').length
  const high = cases.filter((c) => c.priority === 'Critical' || c.priority === 'High')
  const highRun = high.filter((c) => c.manual_result)
  const highPass = highRun.filter((c) => c.manual_result === 'passed').length
  const highPassRate = highRun.length ? Math.round((highPass / highRun.length) * 100) : 0
  const mismatches = cases.filter((c) => mismatch(c.auto_result, c.manual_result)).length
  const untracked = cases.filter((c) => needsTicket(toStageInput(c))).length
  const automated = cases.filter((c) => c.automation === 'automated').length
  const manualTested = cases.filter((c) => c.manual_result).length

  const byArea = new Map(areas.map((a) => [a.id, { cases: [] as typeof cases, tickets: [] as typeof tickets }]))
  for (const c of cases) byArea.get(c.area_id)?.cases.push(c)
  for (const t of tickets) if (t.area_id) byArea.get(t.area_id)?.tickets.push(t)
  const summaries = areas.map((a) => ({ area: a, s: summarizeArea(byArea.get(a.id)!.cases, byArea.get(a.id)!.tickets) }))
  const covered = summaries.filter((x) => x.s.cases > 0).length
  const areasPassing = summaries.filter((x) => x.s.passed > 0).length
  const zones = [...new Set(areas.map((a) => a.zone))]
  const sprintOfArea = new Map<string, string>()
  for (const sa of sprintAreas) {
    const s = sprints.find((x) => x.id === sa.sprint_id)
    if (s && !s.name.startsWith('S11') && !sprintOfArea.has(sa.area_id)) sprintOfArea.set(sa.area_id, s.name)
  }

  let gate: ReturnType<typeof sprintGate> | null = null
  if (sprint) {
    const ids = sprintAreas.filter((x) => x.sprint_id === sprint.id).map((x) => x.area_id)
    const runs = await loadSprintRuns(sprint.id)
    const scoped = cases.filter((c) => ids.includes(c.area_id))
    const caseIds = new Set(scoped.map((c) => c.id))
    gate = sprintGate(
      scoped.map((c) => toStageInput(c, runs)),
      tickets.filter((t) => (t.case_id && caseIds.has(t.case_id)) || t.current_sprint_id === sprint.id),
    )
  }

  const bar = [
    { label: 'No open Critical tickets', ok: openCrit === 0, detail: `${openCrit} open` },
    { label: 'High tickets closed or worked around', ok: openHigh === 0, detail: `${openHigh} open` },
    { label: 'Critical/High cases run manually, 90% passing', ok: highRun.length === high.length && highPassRate >= 90, detail: `${highRun.length} of ${high.length} run · ${highPassRate}% pass` },
    { label: 'Every area has a passing case', ok: areasPassing === areas.length, detail: `${areasPassing} of ${areas.length} areas` },
    { label: 'Every failure tracked', ok: untracked === 0, detail: `${untracked} manual failures without a ticket` },
    { label: 'Automation agrees with manual testing', ok: mismatches === 0, detail: `${mismatches} mismatches` },
  ]

  const stateRows: TicketState[] = ['new', 'triaged', 'in_fix', 'reopened', 'ready_for_retest', 'closed', 'deferred']
  const sev = ['Critical', 'High', 'Medium', 'Low'] as const

  return (
    <>
      <PageHeader
        title={`Release in ${daysUntil(RELEASE_DATE)} days`}
        sub={`26.111 ships ${fmtDate(RELEASE_DATE)}; go/no-go ${fmtDate(GO_NO_GO_DATE)}. Ask MAIA ships behind a flag if it slips.`}
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Stat label="Cases written" value={cases.length} sub={`${covered} of ${areas.length} areas have cases`} />
        <Stat label="Automated" value={automated} sub={`${Math.round((automated / Math.max(cases.length, 1)) * 100)}% of cases`} />
        <Stat label="Manually tested" value={manualTested} sub={`${cases.length - manualTested} not yet`} />
        <Stat label="Open Critical" value={openCrit} tone={openCrit ? 'crit' : 'good'} />
        <Stat label="Open High" value={openHigh} tone={openHigh ? 'warn' : 'good'} />
        <Stat label="Untracked failures" value={untracked} tone={untracked ? 'warn' : 'good'} sub={`${mismatches} auto/manual mismatches`} />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-3">
        <section className="card p-4 lg:col-span-1">
          <h2 className="font-semibold">Release bar</h2>
          <ul className="mt-3 space-y-2">
            {bar.map((b) => (
              <li key={b.label} className="flex gap-2 text-sm">
                <span aria-hidden className={b.ok ? 'text-[var(--good)]' : 'text-[var(--crit)]'}>{b.ok ? '✓' : '✗'}</span>
                <span>
                  {b.label}
                  <span className="block text-xs text-[var(--muted)]">{b.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </section>

        <section className="card p-4 lg:col-span-2">
          <div className="flex items-baseline justify-between">
            <h2 className="font-semibold">{sprint ? `Current sprint: ${sprint.name}` : 'No sprint running'}</h2>
            <Link href={sprint ? `/sprints/${sprint.id}` : '/sprints'} className="text-sm text-[var(--accent)] hover:underline">
              {sprint ? 'Open board' : 'Plan sprints'}
            </Link>
          </div>
          {sprint && (
            <p className="mt-1 text-sm text-[var(--muted)]">
              {fmtDate(sprint.starts_on)} to {fmtDate(sprint.ends_on)} · ends in {Math.max(daysUntil(sprint.ends_on), 0)} days
            </p>
          )}
          {gate && (
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {gate.checks.map((c) => (
                <li key={c.label} className={`rounded-[2px] border p-2 text-sm ${c.ok ? 'border-[var(--good)]' : 'border-[var(--line)]'}`}>
                  <span className={c.ok ? 'text-[var(--good)]' : 'text-[var(--warn)]'}>{c.ok ? '✓ ' : '• '}</span>
                  {c.label}
                  <span className="block text-xs text-[var(--muted)]">{c.detail}</span>
                </li>
              ))}
            </ul>
          )}
          <h3 className="label mt-5">Tickets by state</h3>
          <table className="table mt-1">
            <thead>
              <tr><th>State</th>{sev.map((s) => <th key={s} className="text-right">{s}</th>)}</tr>
            </thead>
            <tbody>
              {stateRows.map((st) => (
                <tr key={st}>
                  <td><Link href={`/tickets?state=${st}`} className="hover:underline">{STATE_LABEL[st]}</Link></td>
                  {sev.map((s) => (
                    <td key={s} className="text-right tabular-nums">
                      {tickets.filter((t) => t.state === st && t.severity === s).length || <span className="text-[var(--muted)]">·</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      <section className="mt-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-semibold">Coverage by area</h2>
          <div className="flex flex-wrap gap-3 text-xs text-[var(--muted)]">
            {(['passing', 'testing', 'failing', 'blocked', 'none'] as const).map((h) => (
              <span key={h} className="flex items-center gap-1">
                <span className={`inline-block h-3 w-3 rounded border ${HEALTH_CLASS[h]}`} />{HEALTH_LABEL[h]}
              </span>
            ))}
          </div>
        </div>
        <div className="mt-3 space-y-4">
          {zones.map((z) => (
            <div key={z}>
              <h3 className="label mb-1.5">{z}</h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
                {summaries.filter((x) => x.area.zone === z).map(({ area, s }) => (
                  <Link key={area.id} href={`/areas/${area.id}`}
                    className={`rounded-[2px] border p-3 hover:opacity-90 ${HEALTH_CLASS[s.health]}`}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-medium text-[var(--ink)]">{area.page}</span>
                      <span className="text-xs text-[var(--muted)]">{sprintOfArea.get(area.id) ?? ''}</span>
                    </div>
                    <div className="mt-1 text-xs text-[var(--muted)]">
                      {s.cases ? `${s.tested}/${s.cases} tested · ${s.open} open` : 'No cases yet'}
                    </div>
                    {s.cases > 0 && (
                      <div className="mt-2">
                        <Bar parts={[
                          { label: 'Passed', value: s.passed, tone: 'good' },
                          { label: 'Failed', value: s.failed, tone: 'crit' },
                          { label: 'Other results', value: s.tested - s.passed - s.failed, tone: 'warn' },
                          { label: 'Not tested', value: s.cases - s.tested, tone: 'muted' },
                        ]} />
                      </div>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  )
}
