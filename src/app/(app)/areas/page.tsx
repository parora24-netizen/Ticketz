import { AreasGrid } from '@/components/grid/list-grids'
import { RELEASE_TABS, Tabs } from '@/components/tabs'
import { PageHeader } from '@/components/ui'
import { HEALTH_LABEL, summarizeArea } from '@/lib/areas'
import { loadAreas, loadCases, loadSprintAreas, loadSprints, loadTickets } from '@/lib/data'

export default async function AreasPage() {
  const [areas, cases, tickets, sprints, sprintAreas] = await Promise.all([loadAreas(), loadCases(), loadTickets(), loadSprints(), loadSprintAreas()])
  const rows = areas.map((a) => {
    const s = summarizeArea(cases.filter((c) => c.area_id === a.id), tickets.filter((t) => t.area_id === a.id))
    return {
      id: a.id,
      zone: a.zone,
      page: a.page,
      sprints: sprintAreas.filter((x) => x.area_id === a.id).map((x) => sprints.find((s) => s.id === x.sprint_id)?.name).filter(Boolean).join(', '),
      cases: s.cases, tested: s.tested, passed: s.passed, open: s.open,
      health: HEALTH_LABEL[s.health],
    }
  })
  return (
    <>
      <Tabs items={RELEASE_TABS} active="areas" />
      <PageHeader sub="The 42 areas from the test workbook's Framework tab. Sprints are planned over these; open one to see its cases." />
      <AreasGrid rows={rows} />
    </>
  )
}
