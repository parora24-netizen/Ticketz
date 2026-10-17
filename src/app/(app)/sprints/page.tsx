import Link from 'next/link'
import { Flash } from '@/components/flash'
import { SprintsGrid } from '@/components/grid/list-grids'
import { Tabs, sprintTabs } from '@/components/tabs'
import { PageHeader } from '@/components/ui'
import { getMe } from '@/lib/auth'
import { currentSprint, fmtDate, loadAreas, loadCases, loadSprintAreas, loadSprints } from '@/lib/data'

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
  const [me, sprints, areas, sprintAreas, cases] = await Promise.all([getMe(), loadSprints(), loadAreas(), loadSprintAreas(), loadCases()])
  const current = currentSprint(sprints)
  const areaName = new Map(areas.map((a) => [a.id, a.page]))
  const casesByArea = new Map<string, number>()
  for (const c of cases) casesByArea.set(c.area_id, (casesByArea.get(c.area_id) ?? 0) + 1)
  const rows = sprints.map((s) => {
    const ids = sprintAreas.filter((x) => x.sprint_id === s.id).map((x) => x.area_id)
    return {
      id: s.id,
      name: s.name,
      starts_on: s.starts_on,
      dates: `${fmtDate(s.starts_on)} to ${fmtDate(s.ends_on)}`,
      days: workingDays(s.starts_on, s.ends_on),
      goal: s.goal ?? '',
      areas: ids.length === areas.length ? 'All areas' : ids.map((id) => areaName.get(id)).join(', '),
      cases: ids.reduce((sum, id) => sum + (casesByArea.get(id) ?? 0), 0),
      status: s.status === 'active' ? 'Running' : s.status === 'closed' ? 'Closed' : 'Planned',
      current: s.id === current?.id,
    }
  })

  return (
    <>
      <Tabs items={sprintTabs(current?.id ?? null)} active="all" />
      <PageHeader sub="Each sprint runs 2 to 4 working days over a set of Framework areas.">
        {me.role === 'lead' && <Link href="/sprints/new" className="btn btn-primary">New sprint</Link>}
      </PageHeader>
      <Flash error={sp.error} ok={sp.ok} />
      <SprintsGrid rows={rows} />
    </>
  )
}
