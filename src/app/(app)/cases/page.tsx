import Link from 'next/link'
import { PageHeader } from '@/components/ui'
import { getMe } from '@/lib/auth'
import { loadAreas, loadCases, loadPeople, loadSprintAreas, loadSprintRuns, loadSprints, toStageInput } from '@/lib/data'
import { STAGE_LABEL, caseStage, mismatch, type Stage } from '@/lib/workflow/case-stage'
import { CasesGrid } from './cases-grid'

export default async function CasesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams
  const [me, areas, sprints, sprintAreas, people] = await Promise.all([getMe(), loadAreas(), loadSprints(), loadSprintAreas(), loadPeople()])
  const sprint = sp.sprint ? sprints.find((s) => s.id === sp.sprint) : undefined
  const scope = sprint ? sprintAreas.filter((x) => x.sprint_id === sprint.id).map((x) => x.area_id) : undefined
  const [all, runs] = await Promise.all([loadCases(scope), sprint ? loadSprintRuns(sprint.id) : Promise.resolve(undefined)])

  const rows = all
    .filter((c) =>
      (!sp.area || c.area_id === sp.area) &&
      (!sp.stage || caseStage(toStageInput(c, runs)) === (sp.stage as Stage)) &&
      (!sp.mismatch || mismatch(c.auto_result, c.manual_result)))
    .map((c) => ({
      id: c.id,
      tc_id: c.tc_id,
      title: c.title,
      area: `${c.zone} · ${c.page}`,
      priority: c.priority,
      automation: c.automation,
      auto_result: c.auto_result,
      manual_result: c.manual_result,
      stage: STAGE_LABEL[caseStage(toStageInput(c, runs))],
      open_tickets: c.open_fix + c.awaiting_retest,
      tester_name: c.tester_name,
    }))
  const area = sp.area ? areas.find((a) => a.id === sp.area) : undefined
  const scopeText = [sprint && `Sprint ${sprint.name}`, area && `${area.zone} · ${area.page}`, sp.stage && STAGE_LABEL[sp.stage as Stage], sp.mismatch && 'Mismatches'].filter(Boolean).join(' · ')
  const canEdit = me.role !== 'dev'

  return (
    <>
      <PageHeader sub={scopeText ? <>{scopeText} · <Link href="/cases" className="text-[var(--accent)] hover:underline">show all</Link></> : `${all.length} cases across ${areas.length} areas`}>
        <Link href="/cases?mismatch=1" className="btn">Mismatches</Link>
        {canEdit && <Link href="/cases/import" className="btn">Import</Link>}
        {canEdit && <Link href="/cases/new" data-create className="btn btn-primary">+ New test case</Link>}
      </PageHeader>
      <CasesGrid rows={rows} inSprint={!!sprint} canEdit={canEdit} people={people.filter((p) => p.active).map((p) => ({ value: p.id, label: p.name }))} areas={areas.map((a) => ({ value: a.id, label: `${a.zone} · ${a.page}` }))} />
    </>
  )
}
