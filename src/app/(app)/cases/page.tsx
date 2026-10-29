import Link from 'next/link'
import { PageHeader } from '@/components/ui'
import { getMe } from '@/lib/auth'
import { loadAreas, loadCases, loadPeople, loadSprintAreas, loadSprintRuns, loadSprints, toStageInput } from '@/lib/data'
import { STAGE_LABEL, caseStage, mismatch, type Stage } from '@/lib/workflow/case-stage'
import { CasesGrid } from './cases-grid'

const MISMATCH_LABEL = { '1': 'Mismatches', type_i: 'Automation failed, manual passed', type_ii: 'Automation passed, manual failed' } as const

export default async function CasesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams
  const [me, areas, sprints, sprintAreas, people] = await Promise.all([getMe(), loadAreas(), loadSprints(), loadSprintAreas(), loadPeople()])
  const sprint = sp.sprint ? sprints.find((s) => s.id === sp.sprint) : undefined
  const scope = sprint ? sprintAreas.filter((x) => x.sprint_id === sprint.id).map((x) => x.area_id) : undefined
  const [all, runs] = await Promise.all([loadCases(scope), sprint ? loadSprintRuns(sprint.id) : Promise.resolve(undefined)])

  // ?mismatch=type_i (automation failed, manual passed), type_ii (the other way), or 1 for either.
  const kind = (c: (typeof all)[number]) => mismatch(c.auto_result, c.manual_result)
  const wantMismatch = (c: (typeof all)[number]) => !sp.mismatch || (sp.mismatch === 'type_i' || sp.mismatch === 'type_ii' ? kind(c) === sp.mismatch : !!kind(c))
  const rows = all
    .filter((c) =>
      (!sp.area || c.area_id === sp.area) &&
      (!sp.stage || caseStage(toStageInput(c, runs)) === (sp.stage as Stage)) &&
      wantMismatch(c))
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
  const scopeText = [sprint && `Sprint ${sprint.name}`, area && `${area.zone} · ${area.page}`, sp.stage && STAGE_LABEL[sp.stage as Stage], sp.mismatch && MISMATCH_LABEL[sp.mismatch as keyof typeof MISMATCH_LABEL]].filter(Boolean).join(' · ')
  const counts = { type_i: all.filter((c) => kind(c) === 'type_i').length, type_ii: all.filter((c) => kind(c) === 'type_ii').length }
  const canEdit = me.role !== 'dev'

  return (
    <>
      <PageHeader sub={scopeText ? <>{scopeText} · <Link href="/cases" className="text-[var(--accent)] hover:underline">show all</Link></> : `${all.length} cases across ${areas.length} areas`}>
        {sp.mismatch
          ? (['type_i', 'type_ii'] as const).map((k) => (
            <Link key={k} href={`/cases?mismatch=${k}`} aria-current={sp.mismatch === k ? 'page' : undefined}
              className={`btn ${sp.mismatch === k ? 'btn-primary' : ''}`}>{MISMATCH_LABEL[k]} · {counts[k]}</Link>
          ))
          : <Link href="/cases?mismatch=1" className="btn">Mismatches</Link>}
        {canEdit && <Link href="/cases/import" className="btn">Import</Link>}
        {canEdit && <Link href="/cases/new" data-create className="btn btn-primary">+ New test case</Link>}
      </PageHeader>
      <CasesGrid rows={rows} remember={!scopeText} inSprint={!!sprint} canEdit={canEdit} isLead={me.role === 'lead'} people={people.filter((p) => p.active).map((p) => ({ value: p.id, label: p.name }))} areas={areas.map((a) => ({ value: a.id, label: `${a.zone} · ${a.page}` }))} />
    </>
  )
}
