import Link from 'next/link'
import { Flash } from '@/components/flash'
import { SprintsGrid } from '@/components/grid/list-grids'
import { Tabs, nowSprints, sprintTabs } from '@/components/tabs'
import { PageHeader } from '@/components/ui'
import { getMe } from '@/lib/auth'
import { runningSprints, fmtDate, loadAreas, loadCases, loadRelease, loadScheduleChanges, loadSprintAreas, loadSprints, loadTickets } from '@/lib/data'
import { ScheduleLog } from '@/components/schedule-log'

function workingDays(from: string, to: string): number {
  let n = 0
  for (let d = Date.parse(`${from}T00:00:00Z`); d <= Date.parse(`${to}T00:00:00Z`); d += 864e5) {
    const wd = new Date(d).getUTCDay()
    if (wd !== 0 && wd !== 6) n++
  }
  return n
}

export default async function SprintsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams
  const [me, sprints, areas, sprintAreas, cases, changes, release, tickets] = await Promise.all([getMe(), loadSprints(), loadAreas(), loadSprintAreas(), loadCases(), loadScheduleChanges(), loadRelease(), loadTickets()])
  const running = runningSprints(sprints)
  const areaName = new Map(areas.map((a) => [a.id, a.page]))
  const casesByArea = new Map<string, number>()
  const testedByArea = new Map<string, number>()
  for (const c of cases) {
    casesByArea.set(c.area_id, (casesByArea.get(c.area_id) ?? 0) + 1)
    if (c.manual_result || c.auto_result) testedByArea.set(c.area_id, (testedByArea.get(c.area_id) ?? 0) + 1)
  }
  const rows = sprints.map((s) => {
    const ids = sprintAreas.filter((x) => x.sprint_id === s.id).map((x) => x.area_id)
    return {
      id: s.id,
      name: s.name,
      kind: { triage: 'Triage', test: 'Test', fix: 'Fix', regression: 'Regression' }[s.kind],
      tickets: tickets.filter((t) => t.current_sprint_id === s.id && !['closed', 'deferred', 'duplicate'].includes(t.state)).length,
      starts_on: s.starts_on,
      dates: `${fmtDate(s.starts_on)} to ${fmtDate(s.ends_on)}`,
      days: workingDays(s.starts_on, s.ends_on),
      goal: s.goal ?? '',
      areas: ids.length === areas.length ? 'All areas' : ids.map((id) => areaName.get(id)).join(', '),
      cases: ids.reduce((sum, id) => sum + (casesByArea.get(id) ?? 0), 0),
      tested: ids.reduce((sum, id) => sum + (testedByArea.get(id) ?? 0), 0),
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
