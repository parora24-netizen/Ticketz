import Link from 'next/link'
import { SprintTimeline } from '@/components/sprint-timeline'
import { RELEASE_TABS, Tabs } from '@/components/tabs'
import { Chip } from '@/components/ui'
import { getMe } from '@/lib/auth'
import { fmtDate, loadAreas, loadCases, loadPeople, loadRelease, loadSprintAreas, loadSprints, loadTickets } from '@/lib/data'
import { sprintHref } from '@/lib/links'
import { pageProgress, pageStatus, passFail } from '@/lib/progress'
import { fixSprintForArea } from '@/lib/workflow/fix-sprint'
import { OPEN_STATES } from '@/lib/workflow/ticket-machine'
import { PlanGrid, type PlanRow } from './plan-grid'

const STATUS: Record<string, { label: string; tone: 'accent' | 'good' | 'muted' }> = {
  active: { label: 'Running', tone: 'accent' }, closed: { label: 'Closed', tone: 'good' }, planned: { label: 'Planned', tone: 'muted' },
}

/** The release plan: the sprints and milestones by date, and each page's dates and sprints. */
export default async function PlanPage() {
  const [me, areas, cases, people, release, sprints, sprintAreas, tickets] = await Promise.all([
    getMe(), loadAreas(), loadCases(), loadPeople(), loadRelease(), loadSprints(), loadSprintAreas(), loadTickets(),
  ])
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10)
  const name = new Map(people.map((p) => [p.id, p.name]))
  const dates = (s?: { starts_on: string; ends_on: string } | null) => (s ? `${fmtDate(s.starts_on)}–${fmtDate(s.ends_on)}` : '')
  const pages = pageProgress(areas, cases, today)
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
    }
  })
  // The sprints from here to the release: the first test and fix sprints (T1, F1) are history.
  const planned = sprints.filter((s) => !/^[TF]\d+$/.test(s.name))
  const sprintRows = planned.map((s) => {
    const ids = new Set(sprintAreas.filter((x) => x.sprint_id === s.id).map((x) => x.area_id))
    const covered = pages.filter((p) => ids.has(p.id))
    const inSprint = cases.filter((c) => ids.has(c.area_id))
    const open = tickets.filter((t) => t.current_sprint_id === s.id && OPEN_STATES.includes(t.state))
    return {
      s, covered, zones: [...new Set(covered.map((p) => p.zone))], cases: inSprint.length,
      automated: inSprint.filter((c) => c.automation === 'automated').length, ...passFail(inSprint),
      critical: open.filter((t) => t.severity === 'Critical').length, high: open.filter((t) => t.severity === 'High').length, open: open.length,
    }
  })
  const num = (n: number) => (n ? n.toLocaleString() : <span className="text-[var(--faint)]">0</span>)
  const ticketsLink = (id: string, n: number, severity?: string, tone = 'text-[var(--accent)]') => (n
    ? <Link href={`/tickets?view=grid&sprint=${id}${severity ? `&severity=${severity}` : ''}`} className={`font-semibold ${tone} hover:underline`}>{n}</Link>
    : <span className="text-[var(--faint)]">0</span>)
  const milestones = [
    { label: 'Cases written', on: pages.map((p) => p.due_on).filter((d): d is string => !!d).sort().at(-1) },
    { label: 'Go/no-go', on: release.go_no_go_on },
    { label: 'Release', on: release.release_on },
  ].filter((m): m is { label: string; on: string } => !!m.on)
  const team = people.filter((p) => p.active && p.role !== 'dev').map((p) => ({ value: p.id, label: p.name }))

  return (
    <>
      <Tabs items={RELEASE_TABS} active="plan" />
      <div className="mb-4 grid gap-3">
        <section className="card">
          <header className="flex items-center justify-between border-b border-[var(--line)] px-4 py-2">
            <h2 className="text-[14px] font-semibold text-[var(--navy-ink)]">Sprints to release</h2>
            <span className="flex gap-3 text-[12px] text-[var(--muted)]">
              {milestones.map((m) => <span key={m.label}>{m.label} <b className="mono text-[var(--ink)]">{fmtDate(m.on)}</b></span>)}
            </span>
          </header>
          <div className="px-4 py-3">
            <SprintTimeline sprints={planned} today={today} releaseOn={release.release_on} goNoGoOn={release.go_no_go_on} />
          </div>
        </section>
        <section className="card overflow-x-auto">
          <table className="table w-full text-[12.5px]">
            <thead><tr>
              <th>Sprint</th><th className="whitespace-nowrap">Dates</th><th>Status</th><th>Pages</th>
              <th className="text-right whitespace-nowrap" title="Test cases on the sprint's pages">Test cases</th><th className="text-right">Automated</th>
              <th className="text-right" title="Latest automated or manual result passed, and neither fails">Passed</th>
              <th className="text-right" title="Latest automated or manual result failed, or a known defect">Failed</th>
              <th className="text-right" title="Open tickets in this sprint">Critical</th><th className="text-right" title="Open tickets in this sprint">High</th><th className="text-right whitespace-nowrap">Open tickets</th>
            </tr></thead>
            <tbody>
              {sprintRows.map(({ s, covered, zones, ...n }) => (
                <tr key={s.id}>
                  <td><Link href={sprintHref(s)} className="font-semibold text-[var(--accent)] hover:underline">{s.name}</Link></td>
                  <td className="mono text-[12px] whitespace-nowrap">{dates(s)}</td>
                  <td><Chip tone={STATUS[s.status].tone}>{STATUS[s.status].label}</Chip></td>
                  <td className="text-[12px] leading-snug">
                    {covered.length === pages.length && pages.length ? `All ${pages.length} pages` : zones.map((z) => (
                      <span key={z} className="mr-2.5"><b className="font-semibold">{z}:</b> {covered.filter((p) => p.zone === z).map((p) => p.page).join(', ')}</span>
                    ))}
                    {!covered.length && <span className="text-[var(--faint)]">—</span>}
                  </td>
                  <td className="text-right tabular-nums">{num(n.cases)}</td>
                  <td className="text-right tabular-nums">{num(n.automated)}</td>
                  <td className="text-right tabular-nums">{num(n.passed)}</td>
                  <td className="text-right tabular-nums">{n.failed ? <span className="font-semibold text-[var(--crit)]">{n.failed.toLocaleString()}</span> : num(0)}</td>
                  <td className="text-right tabular-nums">{ticketsLink(s.id, n.critical, 'Critical', 'text-[var(--crit)]')}</td>
                  <td className="text-right tabular-nums">{ticketsLink(s.id, n.high, 'High', 'text-[var(--warn)]')}</td>
                  <td className="text-right tabular-nums">{ticketsLink(s.id, n.open)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>

      <h2 className="mb-2 text-[14px] font-semibold text-[var(--navy-ink)]">Pages</h2>
      <PlanGrid rows={rows} team={team} isLead={me.role === 'lead'} />
    </>
  )
}
