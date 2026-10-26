import { redirect } from 'next/navigation'
import { Tabs, nowSprints, sprintTabs } from '@/components/tabs'
import { PageHeader } from '@/components/ui'
import { getMe } from '@/lib/auth'
import { fmtDate, loadAreas, loadCases, loadSprintAreas, loadSprints, runningSprints } from '@/lib/data'
import { PlanEditor } from './plan-editor'

/** Edit plan: every zone and page, and the test sprint that tests it. Lead only. */
export default async function EditPlanPage() {
  const me = await getMe()
  if (me.role !== 'lead') redirect('/sprints')
  const [sprints, areas, sprintAreas, cases] = await Promise.all([loadSprints(), loadAreas(), loadSprintAreas(), loadCases()])
  const tests = sprints.filter((s) => s.kind === 'test')
  const open = tests.filter((s) => s.status !== 'closed')
  const openIds = new Set(open.map((s) => s.id))
  const closedIds = new Set(tests.filter((s) => s.status === 'closed').map((s) => s.id))
  const name = new Map(sprints.map((s) => [s.id, s.name]))

  const rows = areas.map((a) => {
    const mine = sprintAreas.filter((x) => x.area_id === a.id)
    const inCases = cases.filter((c) => c.area_id === a.id)
    return {
      id: a.id, zone: a.zone, page: a.page,
      sprint_id: mine.find((x) => openIds.has(x.sprint_id))?.sprint_id ?? null,
      done_in: mine.filter((x) => closedIds.has(x.sprint_id)).map((x) => name.get(x.sprint_id) ?? '').join(', '),
      cases: inCases.length,
      tested: inCases.filter((c) => c.manual_result || c.auto_result).length,
    }
  })

  return (
    <>
      <Tabs items={sprintTabs(nowSprints(sprints, runningSprints(sprints)))} active="all" />
      <PageHeader title="Edit plan" sub="Set sprint dates and choose which test sprint tests each page. Each fix sprint takes what the test sprint before it found. Saved changes go in the schedule log." />
      <PlanEditor rows={rows}
        dated={sprints.filter((s) => s.status !== 'closed').map((s) => ({ id: s.id, name: s.name, kind: s.kind, status: s.status, starts_on: s.starts_on, ends_on: s.ends_on }))}
        sprints={open.map((s) => ({ id: s.id, name: s.name, label: `${s.name} · ${fmtDate(s.starts_on)}–${fmtDate(s.ends_on)}${s.status === 'active' ? ' · running' : ''}` }))} />
    </>
  )
}
