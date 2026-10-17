import Link from 'next/link'
import { Chip, PageHeader } from '@/components/ui'
import { Flash } from '@/components/flash'
import { getMe } from '@/lib/auth'
import { currentSprint, fmtDate, loadAreas, loadCases, loadSprintAreas, loadSprints } from '@/lib/data'
import { SprintForm } from './sprint-form'

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

  return (
    <>
      <PageHeader title="Sprints" sub="Each sprint runs 2 to 4 working days over a set of Framework areas." />
      <Flash error={sp.error} ok={sp.ok} />
      <div className="card overflow-x-auto">
        <table className="table">
          <thead>
            <tr><th>Sprint</th><th>Dates</th><th className="text-right">Days</th><th>Areas</th><th className="text-right">Cases</th><th>Status</th></tr>
          </thead>
          <tbody>
            {sprints.map((s) => {
              const ids = sprintAreas.filter((x) => x.sprint_id === s.id).map((x) => x.area_id)
              const n = ids.reduce((sum, id) => sum + (casesByArea.get(id) ?? 0), 0)
              return (
                <tr key={s.id} className={s.id === current?.id ? 'bg-[var(--accent-soft)]' : ''}>
                  <td><Link href={`/sprints/${s.id}`} className="font-medium text-[var(--accent)] hover:underline">{s.name}</Link>
                    {s.goal && <div className="text-xs text-[var(--muted)]">{s.goal}</div>}</td>
                  <td className="whitespace-nowrap">{fmtDate(s.starts_on)} to {fmtDate(s.ends_on)}</td>
                  <td className="text-right tabular-nums">{workingDays(s.starts_on, s.ends_on)}</td>
                  <td className="max-w-md text-xs">{ids.length === areas.length ? 'All areas' : ids.map((id) => areaName.get(id)).join(', ')}</td>
                  <td className="text-right tabular-nums">{n}</td>
                  <td><Chip tone={s.status === 'active' ? 'accent' : s.status === 'closed' ? 'good' : 'muted'}>{s.status === 'active' ? 'Running' : s.status === 'closed' ? 'Closed' : 'Planned'}</Chip></td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {me.role === 'lead' && (
        <details className="card mt-6 p-4">
          <summary className="cursor-pointer font-semibold">New sprint</summary>
          <div className="mt-4"><SprintForm areas={areas} /></div>
        </details>
      )}
    </>
  )
}
