import Link from 'next/link'
import { workingDaysBetween } from '@/lib/schedule'
import { Flash } from '@/components/flash'
import { SprintsGrid } from '@/components/grid/list-grids'
import { Tabs, nowSprints, sprintTabs } from '@/components/tabs'
import { PageHeader } from '@/components/ui'
import { getMe } from '@/lib/auth'
import { runningSprints, fmtDate, loadAreas, loadCases, loadRelease, loadScheduleChanges, loadSprintAreas, loadSprints, loadTickets, loadHolidays } from '@/lib/data'
import { ScheduleLog } from '@/components/schedule-log'


export default async function SprintsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams
  const [me, sprints, areas, sprintAreas, cases, changes, release, tickets, holidays] = await Promise.all([getMe(), loadSprints(), loadAreas(), loadSprintAreas(), loadCases(), loadScheduleChanges(), loadRelease(), loadTickets(), loadHolidays()])
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
  const rows = sprints.map((s) => {
    const ids = sprintAreas.filter((x) => x.sprint_id === s.id).map((x) => x.area_id)
    const own = tickets.filter((t) => t.current_sprint_id === s.id)
    const open = own.filter((t) => !['closed', 'deferred', 'duplicate'].includes(t.state))
    // Test sprints cover their areas; fix sprints cover wherever their tickets are (closed ones too).
    const spots = s.kind === 'fix'
      ? own.filter((t) => t.zone).map((t) => ({ zone: t.zone!, page: t.page! }))
      : ids.map((id) => areaById.get(id)).filter((a) => !!a).map((a) => ({ zone: a!.zone, page: a!.page }))
    const zones = [...new Set(spots.map((x) => x.zone))]
    // Pages are always named; a zone covered in full says so after them.
    const pageText = zones.map((z) => {
      const pages = [...new Set(spots.filter((x) => x.zone === z).map((x) => x.page))]
      const list = pages.join(', ') + (s.kind !== 'fix' && pages.length > 1 && pages.length === pagesInZone(z) ? ` (all ${pages.length})` : '')
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
      empty: s.kind === 'fix' ? 'No tickets yet' : s.kind === 'triage' ? 'Ticket triage' : 'No areas yet',
      status: s.status === 'active' ? 'Running' : s.status === 'closed' ? 'Closed' : 'Planned',
      current: running.some((r) => r.id === s.id),
    }
  })

  return (
    <>
      <Tabs items={sprintTabs(nowSprints(sprints, running))} active="all" />
      <PageHeader>
        {me.role === 'lead' && <Link href="/sprints/new" data-create className="btn btn-primary">+ New sprint</Link>}
      </PageHeader>
      <Flash error={sp.error} ok={sp.ok} />
      <SprintsGrid rows={rows} />
      <ScheduleLog changes={changes} release={release} />
    </>
  )
}
