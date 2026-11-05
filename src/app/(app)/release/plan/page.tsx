import Link from 'next/link'
import { ReleaseDateButton } from '@/components/release-controls'
import { ScheduleLog } from '@/components/schedule-log'
import { RELEASE_TABS, Tabs } from '@/components/tabs'
import { Chip } from '@/components/ui'
import { getMe } from '@/lib/auth'
import { casesHref } from '@/lib/case-links'
import { fmtDate, isEarlierSprint, loadAreas, loadCases, loadPeople, loadRelease, loadScheduleChanges, loadSprintAreas, loadSprints, loadTickets } from '@/lib/data'
import { sprintHref } from '@/lib/links'
import { pageProgress, pageStatus, passFail } from '@/lib/progress'
import { fixSprintForArea, followsPage } from '@/lib/workflow/fix-sprint'
import { OPEN_STATES } from '@/lib/workflow/ticket-machine'
import { InfoTip } from '@/components/info-tip'
import { SprintDatesButton, ZonesInRelease } from './plan-controls'
import { PlanGrid, type PlanRow } from './plan-grid'

/** The number columns of the sprint table, in their groups, with what each one counts. */
const COLUMN_GROUPS = [
  { group: 'Results', info: 'Passed + Failed + No result add up to Test cases.', columns: [
    { label: 'Passed', info: 'The latest automated or manual result passed, and neither one failed.' },
    { label: 'Failed', info: 'The latest automated or manual result failed or is a known defect. A failure on either side counts here.' },
    { label: 'No result', info: 'Neither passed nor failed yet: not run, or only skipped or blocked.' },
  ] },
  { group: 'Testing', info: 'How the cases get tested. These overlap, since a case can be both, so they do not add up to Test cases.', columns: [
    { label: 'Automated', info: 'Test cases with an automated test.' },
    { label: 'Manual tested', info: 'Test cases that need a manual test and have a manual result, as on the Status tab. Needing one means Critical or High, not automated, or automation did not pass.' },
  ] },
  { group: 'Open tickets', info: 'Tickets, not cases, sitting in this sprint. They will not match Failed: one ticket can cover several cases, and some failed cases have no open ticket.', columns: [
    { label: 'All', info: 'All open tickets in this sprint, at any severity.' },
    { label: 'Critical', info: 'Open Critical tickets in this sprint.' },
    { label: 'High', info: 'Open High tickets in this sprint.' },
  ] },
]
const GROUP_START = 'border-l border-[var(--line)]'
const STATUS: Record<string, { label: string; tone: 'accent' | 'good' | 'muted' }> = {
  active: { label: 'Running', tone: 'accent' }, closed: { label: 'Closed', tone: 'good' }, planned: { label: 'Planned', tone: 'muted' },
}

/** The release plan, and the one place to change it: sprints and milestones by date, each page's dates and sprint, and the log of changes. */
export default async function PlanPage() {
  const [me, areas, cases, people, release, sprints, sprintAreas, tickets, changes] = await Promise.all([
    getMe(), loadAreas(), loadCases(), loadPeople(), loadRelease(), loadSprints(), loadSprintAreas(), loadTickets(), loadScheduleChanges(),
  ])
  const lead = me.role === 'lead'
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10)
  const name = new Map(people.map((p) => [p.id, p.name]))
  const dates = (s?: { starts_on: string; ends_on: string } | null) => (s ? `${fmtDate(s.starts_on)}–${fmtDate(s.ends_on)}` : '')
  const pages = pageProgress(areas, cases, today)
  const open = tickets.filter((t) => OPEN_STATES.includes(t.state))
  const rows: PlanRow[] = pages.map((p) => {
    const st = pageStatus(p)
    const fix = fixSprintForArea(p.id, sprints, sprintAreas)
    // Tested (automation and by hand) the week before its fix sprint.
    const shift = (d: string, days: number) => new Date(Date.parse(`${d}T00:00:00Z`) + days * 864e5).toISOString().slice(0, 10)
    const test = fix ? { name: 'Week of', starts_on: shift(fix.starts_on, -7), ends_on: shift(fix.starts_on, -3) } : null
    return {
      id: p.id, zone: p.zone, page: p.page, writer: p.owner_id ? name.get(p.owner_id) ?? 'Someone' : '', owner_id: p.owner_id ?? null,
      due_on: p.due_on ?? null, writing: st.writing, done: p.writing === 'done', late: p.late,
      automate_due_on: p.automate_due_on ?? null, automation: st.automation, automateLate: p.automateLate,
      test: test ? dates(test) : '', testStart: test?.starts_on ?? '',
      fix: fix?.name ?? '', fixDates: dates(fix), fixStart: fix?.starts_on ?? '',
      openSprints: open.filter((t) => t.area_id === p.id).map((t) => t.current_sprint_id), stayInRunning: open.filter((t) => t.area_id === p.id && !followsPage(t, sprints)).length,
    }
  })
  const planned = sprints.filter((s) => !isEarlierSprint(s))
  const sprintRows = planned.map((s) => {
    const ids = new Set(sprintAreas.filter((x) => x.sprint_id === s.id).map((x) => x.area_id))
    const covered = pages.filter((p) => ids.has(p.id))
    const inSprint = cases.filter((c) => ids.has(c.area_id))
    const inIt = open.filter((t) => t.current_sprint_id === s.id)
    return {
      s, covered, zones: [...new Set(covered.map((p) => p.zone))], cases: inSprint.length,
      automated: inSprint.filter((c) => c.automation === 'automated').length, ...passFail(inSprint),
      manual: covered.reduce((sum, p) => sum + p.manualDone, 0),
      critical: inIt.filter((t) => t.severity === 'Critical').length, high: inIt.filter((t) => t.severity === 'High').length, open: inIt.length,
    }
  })
  const num = (n: number, href: string, tone = 'text-[var(--accent)]') => (n
    ? <Link href={href} className={`font-semibold ${tone} hover:underline`}>{n.toLocaleString()}</Link>
    : <span className="text-[var(--faint)]">0</span>)
  const ticketsLink = (id: string, n: number, severity?: string, tone = 'text-[var(--accent)]') => (n
    ? <Link href={`/tickets?view=grid&sprint=${id}${severity ? `&severity=${severity}` : ''}`} className={`font-semibold ${tone} hover:underline`}>{n}</Link>
    : <span className="text-[var(--faint)]">0</span>)
  const milestones = [
    { label: 'Cases written', on: pages.map((p) => p.due_on).filter((d): d is string => !!d).sort().at(-1) },
    { label: 'Go/no-go', on: release.go_no_go_on },
    { label: 'Release', on: release.release_on },
  ].filter((m): m is { label: string; on: string } => !!m.on)
  const team = people.filter((p) => p.active && p.role !== 'dev').map((p) => ({ value: p.id, label: p.name }))
  const movable = planned.filter((s) => ['triage', 'fix'].includes(s.kind) && s.status !== 'closed').map((s) => ({ value: s.id, label: s.name }))
  const out = areas.filter((a) => a.in_release === false)

  return (
    <>
      <Tabs items={RELEASE_TABS} active="plan" />
      <section className="card mb-4 overflow-x-auto">
        <header className="flex items-center justify-between border-b border-[var(--line)] px-4 py-2">
          <h2 className="text-[14px] font-semibold text-[var(--navy-ink)]">Sprints to release</h2>
          <span className="flex items-center gap-3 text-[12px] text-[var(--muted)]">
            {milestones.map((m) => <span key={m.label}>{m.label} <b className="mono text-[var(--ink)]">{fmtDate(m.on)}</b></span>)}
            {lead && <ReleaseDateButton release_on={release.release_on} go_no_go_on={release.go_no_go_on} />}
            {lead && <Link href="/sprints/new" data-create className="btn">+ New sprint</Link>}
          </span>
        </header>
        <table className="table w-full text-[12.5px]">
          <thead>
            <tr>
              <th rowSpan={2}>Sprint</th><th rowSpan={2} className="whitespace-nowrap">Dates</th><th rowSpan={2}>Status</th>
              <th rowSpan={2}>Pages<InfoTip text="The pages this sprint fixes. Green means writing their test cases is completed." /></th>
              <th rowSpan={2} className={`text-right whitespace-nowrap ${GROUP_START}`}>Test cases<InfoTip text="All test cases on the sprint’s pages." /></th>
              {COLUMN_GROUPS.map((g) => <th key={g.group} colSpan={g.columns.length} className={`text-center whitespace-nowrap ${GROUP_START}`}>{g.group}<InfoTip text={g.info} /></th>)}
            </tr>
            <tr>
              {COLUMN_GROUPS.flatMap((g) => g.columns.map((c, i) => (
                <th key={c.label} className={`text-right whitespace-nowrap ${i === 0 ? GROUP_START : ''}`}>{c.label}<InfoTip text={c.info} /></th>
              )))}
            </tr>
          </thead>
          <tbody>
            {sprintRows.map(({ s, covered, zones, ...n }) => (
              <tr key={s.id}>
                <td><Link href={sprintHref(s)} className="font-semibold text-[var(--accent)] hover:underline">{s.name}</Link></td>
                <td className="mono text-[12px] whitespace-nowrap">{lead && s.status !== 'closed'
                  ? <SprintDatesButton sprint={{ id: s.id, name: s.name, status: s.status, starts_on: s.starts_on, ends_on: s.ends_on, goal: s.goal }} label={dates(s)} goNoGo={release.go_no_go_on} />
                  : dates(s)}</td>
                <td><Chip tone={STATUS[s.status].tone}>{STATUS[s.status].label}</Chip></td>
                <td className="text-[12px] leading-snug">
                  {covered.length === pages.length && pages.length ? `All ${pages.length} pages` : zones.map((z) => (
                    <span key={z} className="mr-2.5"><b className="font-semibold">{z}:</b> {covered.filter((p) => p.zone === z).map((p, i) => (
                      <span key={p.id}>{i > 0 && ', '}<span className={p.writing === 'done' ? 'font-medium text-[var(--good)]' : undefined} title={p.writing === 'done' ? 'Writing completed' : undefined}>{p.page}</span></span>
                    ))}</span>
                  ))}
                  {!covered.length && <span className="text-[var(--faint)]">—</span>}
                </td>
                <td className={`text-right tabular-nums ${GROUP_START}`}>{num(n.cases, casesHref({ sprint: s.id }))}</td>
                <td className={`text-right tabular-nums ${GROUP_START}`}>{num(n.passed, casesHref({ sprint: s.id, outcome: 'passed' }))}</td>
                <td className="text-right tabular-nums">{num(n.failed, casesHref({ sprint: s.id, outcome: 'failed' }), 'text-[var(--crit)]')}</td>
                <td className="text-right tabular-nums">{num(n.cases - n.passed - n.failed, casesHref({ sprint: s.id, outcome: 'none' }))}</td>
                <td className={`text-right tabular-nums ${GROUP_START}`}>{num(n.automated, casesHref({ sprint: s.id, automation: 'automated' }))}</td>
                <td className="text-right tabular-nums">{num(n.manual, casesHref({ sprint: s.id, hand: 'tested' }))}</td>
                <td className={`text-right tabular-nums ${GROUP_START}`}>{ticketsLink(s.id, n.open)}</td>
                <td className="text-right tabular-nums">{ticketsLink(s.id, n.critical, 'Critical', 'text-[var(--crit)]')}</td>
                <td className="text-right tabular-nums">{ticketsLink(s.id, n.high, 'High', 'text-[var(--warn)]')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <h2 className="mb-2 text-[14px] font-semibold text-[var(--navy-ink)]">Pages</h2>
      <PlanGrid rows={rows} team={team} sprints={movable} isLead={lead} />
      {lead && <ZonesInRelease inZones={[...new Set(pages.map((p) => p.zone))]} outZones={[...new Set(out.map((a) => a.zone))].map((zone) => ({ zone, pages: out.filter((a) => a.zone === zone).length }))} />}
      <ScheduleLog changes={changes} release={release} />
    </>
  )
}
