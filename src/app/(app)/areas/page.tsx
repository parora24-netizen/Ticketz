import Link from 'next/link'
import { Bar, PageHeader } from '@/components/ui'
import { HEALTH_CLASS, HEALTH_LABEL, summarizeArea } from '@/lib/areas'
import { loadAreas, loadCases, loadSprintAreas, loadSprints, loadTickets } from '@/lib/data'

export default async function AreasPage() {
  const [areas, cases, tickets, sprints, sprintAreas] = await Promise.all([loadAreas(), loadCases(), loadTickets(), loadSprints(), loadSprintAreas()])
  const sprintsOf = (areaId: string) =>
    sprintAreas.filter((x) => x.area_id === areaId).map((x) => sprints.find((s) => s.id === x.sprint_id)?.name).filter(Boolean).join(', ')
  return (
    <>
      <PageHeader title="Framework areas" sub="The 42 areas from the test workbook's Framework tab. Sprints are planned over these." />
      <div className="card overflow-x-auto">
        <table className="table">
          <thead><tr><th>Zone</th><th>Area</th><th>Sprints</th><th className="text-right">Cases</th><th className="text-right">Tested</th><th className="text-right">Passed</th><th className="text-right">Open tickets</th><th className="w-48">Results</th><th>Status</th></tr></thead>
          <tbody>
            {areas.map((a) => {
              const s = summarizeArea(cases.filter((c) => c.area_id === a.id), tickets.filter((t) => t.area_id === a.id))
              return (
                <tr key={a.id}>
                  <td className="text-[var(--muted)]">{a.zone}</td>
                  <td><Link href={`/cases?area=${a.id}`} className="font-medium text-[var(--accent)] hover:underline">{a.page}</Link></td>
                  <td className="text-xs">{sprintsOf(a.id)}</td>
                  <td className="text-right tabular-nums">{s.cases}</td>
                  <td className="text-right tabular-nums">{s.tested}</td>
                  <td className="text-right tabular-nums">{s.passed}</td>
                  <td className="text-right tabular-nums">{s.open || ''}</td>
                  <td>{s.cases > 0 && <Bar parts={[
                    { label: 'Passed', value: s.passed, tone: 'good' },
                    { label: 'Failed', value: s.failed, tone: 'crit' },
                    { label: 'Other results', value: s.tested - s.passed - s.failed, tone: 'warn' },
                    { label: 'Not tested', value: s.cases - s.tested, tone: 'muted' },
                  ]} />}</td>
                  <td><span className={`chip border ${HEALTH_CLASS[s.health]}`}>{HEALTH_LABEL[s.health]}</span></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </>
  )
}
