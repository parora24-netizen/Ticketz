import Link from 'next/link'
import { SprintTimeline } from '@/components/sprint-timeline'
import { RELEASE_TABS, Tabs } from '@/components/tabs'
import { Chip, PageHeader } from '@/components/ui'
import { getMe } from '@/lib/auth'
import { fmtDate, loadAreas, loadCases, loadPeople, loadRelease, loadSprintAreas, loadSprints, loadTickets } from '@/lib/data'
import { sprintHref } from '@/lib/links'
import { pageProgress, pageStatus } from '@/lib/progress'
import { fixSprintForArea } from '@/lib/workflow/fix-sprint'
import { OPEN_STATES } from '@/lib/workflow/ticket-machine'
import { PlanGrid, type PlanRow } from './plan-grid'

const KIND: Record<string, string> = { triage: 'Triage', test: 'Test', fix: 'Fix', regression: 'Regression' }
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
    const test = sprintAreas.filter((x) => x.area_id === p.id).map((x) => sprints.find((s) => s.id === x.sprint_id))
      .filter((s) => s?.kind === 'test').sort((a, b) => (a!.status === 'closed' ? 1 : 0) - (b!.status === 'closed' ? 1 : 0))[0]
    const fix = fixSprintForArea(p.id, sprints, sprintAreas)
    return {
      id: p.id, zone: p.zone, page: p.page, writer: p.owner_id ? name.get(p.owner_id) ?? 'Someone' : '', owner_id: p.owner_id ?? null,
      due_on: p.due_on ?? null, writing: st.writing, done: p.writing === 'done', late: p.late,
      automate_due_on: p.automate_due_on ?? null, automation: st.automation, automateLate: p.automateLate,
      test: test?.name ?? '', testDates: dates(test), testStart: test?.starts_on ?? '',
      fix: fix?.name ?? '', fixDates: dates(fix), fixStart: fix?.starts_on ?? '',
    }
  })
  const openIn = (id: string) => tickets.filter((t) => t.current_sprint_id === id && OPEN_STATES.includes(t.state)).length
  const pagesIn = (id: string) => sprintAreas.filter((x) => x.sprint_id === id && pages.some((p) => p.id === x.area_id)).length
  const milestones = [
    { label: 'Cases written', on: pages.map((p) => p.due_on).filter((d): d is string => !!d).sort().at(-1) },
    { label: 'Go/no-go', on: release.go_no_go_on },
    { label: 'Release', on: release.release_on },
  ].filter((m): m is { label: string; on: string } => !!m.on)
  const team = people.filter((p) => p.active && p.role !== 'dev').map((p) => ({ value: p.id, label: p.name }))

  return (
    <>
      <Tabs items={RELEASE_TABS} active="plan" />
      <PageHeader sub={`Ships ${fmtDate(release.release_on)} · go/no-go ${fmtDate(release.go_no_go_on)}`} />

      <div className="mb-4 grid gap-4 xl:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
        <section className="card">
          <header className="flex items-center justify-between border-b border-[var(--line)] px-4 py-2.5">
            <h2 className="text-[14px] font-semibold text-[var(--navy-ink)]">Sprints to release</h2>
            <span className="flex gap-3 text-[12px] text-[var(--muted)]">
              {milestones.map((m) => <span key={m.label}>{m.label} <b className="mono text-[var(--ink)]">{fmtDate(m.on)}</b></span>)}
            </span>
          </header>
          <div className="px-4 py-4">
            <SprintTimeline sprints={sprints} today={today} releaseOn={release.release_on} goNoGoOn={release.go_no_go_on} />
          </div>
        </section>
        <section className="card overflow-x-auto">
          <table className="table w-full text-[12.5px]">
            <thead><tr><th>Sprint</th><th>Type</th><th>Dates</th><th>Status</th><th className="text-right">Pages</th><th className="text-right">Open tickets</th></tr></thead>
            <tbody>
              {sprints.map((s) => (
                <tr key={s.id}>
                  <td><Link href={sprintHref(s)} className="font-semibold text-[var(--accent)] hover:underline">{s.name}</Link></td>
                  <td>{KIND[s.kind] ?? s.kind}</td>
                  <td className="mono text-[12px]">{dates(s)}</td>
                  <td><Chip tone={STATUS[s.status].tone}>{STATUS[s.status].label}</Chip></td>
                  <td className="text-right tabular-nums">{pagesIn(s.id) || <span className="text-[var(--faint)]">—</span>}</td>
                  <td className="text-right tabular-nums">{openIn(s.id)
                    ? <Link href={`/tickets?view=grid&sprint=${s.id}`} className="font-semibold text-[var(--accent)] hover:underline">{openIn(s.id)}</Link>
                    : <span className="text-[var(--faint)]">0</span>}</td>
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
