import { CaseLink, Chip, Empty, PageHeader, PriorityChip, ResultChip } from '@/components/ui'
import { loadAreas, loadCases, loadSprintAreas, loadSprintRuns, loadSprints, toStageInput } from '@/lib/data'
import { STAGES, STAGE_LABEL, caseStage, mismatch, type Stage } from '@/lib/workflow/case-stage'

const LIMIT = 300

export default async function CasesPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams
  const [areas, sprints, sprintAreas] = await Promise.all([loadAreas(), loadSprints(), loadSprintAreas()])
  const sprint = sp.sprint ? sprints.find((s) => s.id === sp.sprint) : undefined
  const scope = sprint ? sprintAreas.filter((x) => x.sprint_id === sprint.id).map((x) => x.area_id) : undefined
  const [all, runs] = await Promise.all([loadCases(scope), sprint ? loadSprintRuns(sprint.id) : Promise.resolve(undefined)])

  const q = (sp.q ?? '').toLowerCase()
  const rows = all.filter((c) =>
    (!sp.area || c.area_id === sp.area) &&
    (!sp.priority || c.priority === sp.priority) &&
    (!sp.auto || (sp.auto === 'none' ? !c.auto_result : c.auto_result === sp.auto)) &&
    (!sp.manual || (sp.manual === 'none' ? !c.manual_result : c.manual_result === sp.manual)) &&
    (!sp.automation || c.automation === sp.automation) &&
    (!sp.mismatch || mismatch(c.auto_result, c.manual_result)) &&
    (!sp.stage || caseStage(toStageInput(c, runs)) === (sp.stage as Stage)) &&
    (!q || c.tc_id.toLowerCase().includes(q) || c.title.toLowerCase().includes(q)),
  )
  const zones = [...new Set(areas.map((a) => a.zone))]

  return (
    <>
      <PageHeader title="Test cases" sub={`${rows.length} of ${all.length} cases${sprint ? ` in ${sprint.name}` : ''}`} />
      <form className="card mb-4 grid gap-2 p-3 sm:grid-cols-3 lg:grid-cols-8">
        {sprint && <input type="hidden" name="sprint" value={sprint.id} />}
        <input name="q" defaultValue={sp.q} placeholder="Search ID or title" className="input lg:col-span-2" />
        <select name="area" defaultValue={sp.area ?? ''} className="select">
          <option value="">All areas</option>
          {zones.map((z) => (
            <optgroup key={z} label={z}>
              {areas.filter((a) => a.zone === z).map((a) => <option key={a.id} value={a.id}>{a.page}</option>)}
            </optgroup>
          ))}
        </select>
        <select name="priority" defaultValue={sp.priority ?? ''} className="select">
          <option value="">Any priority</option>
          {['Critical', 'High', 'Medium', 'Low'].map((p) => <option key={p}>{p}</option>)}
        </select>
        <select name="automation" defaultValue={sp.automation ?? ''} className="select">
          <option value="">Any automation</option>
          <option value="automated">Automated</option>
          <option value="not_automated">Not automated</option>
          <option value="manual_only">Manual only</option>
        </select>
        <select name="auto" defaultValue={sp.auto ?? ''} className="select">
          <option value="">Any auto result</option>
          <option value="none">No auto result</option>
          <option value="passed">Passed</option><option value="failed">Failed</option>
          <option value="known_defect">Known defect</option><option value="skipped">Skipped</option>
        </select>
        <select name="manual" defaultValue={sp.manual ?? ''} className="select">
          <option value="">Any manual result</option>
          <option value="none">Not tested</option>
          <option value="passed">Passed</option><option value="failed">Failed</option><option value="blocked">Blocked</option>
        </select>
        <select name="stage" defaultValue={sp.stage ?? ''} className="select">
          <option value="">Any stage</option>
          {STAGES.map((s) => <option key={s} value={s}>{STAGE_LABEL[s]}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="mismatch" value="1" defaultChecked={!!sp.mismatch} />Mismatches only</label>
        <button className="btn btn-primary">Filter</button>
      </form>
      <div className="card overflow-x-auto">
        <table className="table">
          <thead><tr><th>ID</th><th>Title</th><th>Area</th><th>Priority</th><th>Automation</th><th>Auto</th><th>Manual</th><th>Tickets</th></tr></thead>
          <tbody>
            {rows.slice(0, LIMIT).map((c) => {
              const mm = mismatch(c.auto_result, c.manual_result)
              return (
                <tr key={c.id}>
                  <td><CaseLink tcId={c.tc_id} /></td>
                  <td className="max-w-md">{c.title}</td>
                  <td className="whitespace-nowrap text-xs">{c.zone} · {c.page}</td>
                  <td><PriorityChip p={c.priority} /></td>
                  <td className="text-xs">{c.automation === 'automated' ? 'Automated' : c.automation === 'manual_only' ? 'Manual only' : 'Not yet'}</td>
                  <td><ResultChip r={c.auto_result} /></td>
                  <td><ResultChip r={c.manual_result} />{mm && <span className="ml-1"><Chip tone="warn">{mm === 'type_ii' ? 'Auto passed' : 'Auto failed'}</Chip></span>}</td>
                  <td className="tabular-nums">{c.open_fix + c.awaiting_retest || ''}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
        {rows.length === 0 && <Empty>No cases match these filters.</Empty>}
        {rows.length > LIMIT && <Empty>Showing the first {LIMIT}. Narrow the filters to see the rest.</Empty>}
      </div>
    </>
  )
}
