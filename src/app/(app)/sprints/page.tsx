import Link from 'next/link'
import { workingDaysBetween } from '@/lib/schedule'
import { Flash } from '@/components/flash'
import { SprintsGrid } from '@/components/grid/list-grids'
import { Tabs, nowSprints, sprintTabs } from '@/components/tabs'
import { PageHeader } from '@/components/ui'
import { runningSprints, fmtDate, isEarlierSprint, loadAreas, loadCases, loadSprintAreas, loadSprints, loadTickets, loadHolidays } from '@/lib/data'


export default async function SprintsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams
  const [sprints, areas, sprintAreas, cases, tickets, holidays] = await Promise.all([loadSprints(), loadAreas(), loadSprintAreas(), loadCases(), loadTickets(), loadHolidays()])
  // T1 and F1 are history: one click away, not in the list.
  const showEarlier = sp.earlier === '1'
  const running = runningSprints(sprints)
  const off = new Set(holidays.map((h) => h.day))
  const areaById = new Map(areas.map((a) => [a.id, a]))
  const pagesInZone = (zone: string) => areas.filter((a) => a.zone === zone).length
  const casesByArea = new Map<string, number>()
  const testedByArea = new Map<string, number>()
  for (const c of cases) {
    casesByArea.set(c.area_id, (casesByArea.get(c.area_id) ?? 0) + 1)
    if (c.manual_result || c.auto_result) testedByArea.set(c.area_id, (testedByArea.get(c.area_id) ?? 0) + 1)
  }
  const rows = sprints.filter((s) => showEarlier || !isEarlierSprint(s)).map((s) => {
    const ids = sprintAreas.filter((x) => x.sprint_id === s.id).map((x) => x.area_id)
    const own = tickets.filter((t) => t.current_sprint_id === s.id)
    const open = own.filter((t) => !['closed', 'deferred', 'duplicate'].includes(t.state))
    // A sprint covers the pages the plan gives it; an older fix sprint without any, wherever its tickets are.
    const planned = ids.map((id) => areaById.get(id)).filter((a) => !!a && a.in_release !== false).map((a) => ({ zone: a!.zone, page: a!.page }))
    const spots = planned.length || s.kind !== 'fix' ? planned : own.filter((t) => t.zone).map((t) => ({ zone: t.zone!, page: t.page! }))
    const zones = [...new Set(spots.map((x) => x.zone))]
    // Pages are always named; a zone covered in full says so after them.
    const pageText = zones.map((z) => {
      const pages = [...new Set(spots.filter((x) => x.zone === z).map((x) => x.page))]
      const list = pages.join(', ') + (planned.length > 0 && pages.length > 1 && pages.length === pagesInZone(z) ? ` (all ${pages.length})` : '')
      return zones.length > 1 ? `${z}: ${list}` : list
    }).join(' · ')
    // A fix sprint's cases are the ones behind its tickets; its progress is tickets resolved.
    const fixCases = new Set(own.map((t) => t.case_id).filter(Boolean)).size
    return {
      id: s.id,
      name: s.name,
      kind: { triage: 'Triage', test: 'Test', fix: 'Fix', regression: 'Regression' }[s.kind],
      tickets: open.length,
      starts_on: s.starts_on,
      dates: `${fmtDate(s.starts_on)} to ${fmtDate(s.ends_on)}`,
      days: workingDaysBetween(s.starts_on, s.ends_on, off),
      zones: zones.join(', '),
      pages: pageText,
      cases: s.kind === 'fix' ? fixCases : ids.reduce((sum, id) => sum + (casesByArea.get(id) ?? 0), 0),
      done: s.kind === 'fix' ? own.length - open.length : ids.reduce((sum, id) => sum + (testedByArea.get(id) ?? 0), 0),
      of: s.kind === 'fix' ? own.length : ids.reduce((sum, id) => sum + (casesByArea.get(id) ?? 0), 0),
      empty: s.kind === 'triage' ? 'Ticket triage' : 'No pages yet',
      status: s.status === 'active' ? 'Running' : s.status === 'closed' ? 'Closed' : 'Planned',
      current: running.some((r) => r.id === s.id),
    }
  })

  return (
    <>
      <Tabs items={sprintTabs(nowSprints(sprints, running))} active="all" />
      <PageHeader sub={<>Each sprint&apos;s dates and pages are planned on <Link href="/release/plan" className="text-[var(--accent)] hover:underline">Release › Plan</Link>.</>} />
      <Flash error={sp.error} ok={sp.ok} />
      <SprintsGrid rows={rows} />
      <p className="mt-3 text-[12.5px]"><Link href={showEarlier ? '/sprints' : '/sprints?earlier=1'} className="text-[var(--accent)] hover:underline">{showEarlier ? 'Hide earlier sprints' : 'Earlier sprints (T1, F1)'}</Link></p>
    </>
  )
}
