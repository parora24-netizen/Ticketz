import Link from 'next/link'
import { PageHeader, Stat } from '@/components/ui'
import {
  currentSprint, daysLeft, daysUntil, fmtDate, loadActivity, loadCases, loadPeople, loadSprintAreas, loadSprintRuns, loadSprints, loadTasks, loadTickets, toStageInput,
} from '@/lib/data'
import { buildStandup, lastWorkingDayStart } from '@/lib/standup'
import { istDate } from '@/lib/trends'
import { caseStage } from '@/lib/workflow/case-stage'
import { sprintGate } from '@/lib/workflow/sprint-gate'
import { StandupDeck } from './standup-deck'

export default async function StandupPage() {
  const now = new Date()
  const since = lastWorkingDayStart(now)
  const [people, tickets, tasks, activity, sprints, sprintAreas] = await Promise.all([
    loadPeople(), loadTickets(), loadTasks(), loadActivity(since), loadSprints(), loadSprintAreas(),
  ])
  const { cards, unassigned } = buildStandup({
    now,
    people: people.filter((p) => p.active).map((p) => ({ id: p.id, name: p.name, role: p.role })),
    activity,
    tickets,
    tasks,
  })
  // Most to talk about first: blocked, then busiest.
  cards.sort((a, b) => b.blocked.length - a.blocked.length || (b.today.length + b.yesterday.length) - (a.today.length + a.yesterday.length))

  // Before any sprint runs, talk about the next one.
  const running = currentSprint(sprints)
  const sprint = running ?? sprints.find((s) => s.status === 'planned') ?? null
  const areaIds = sprint ? sprintAreas.filter((x) => x.sprint_id === sprint.id).map((x) => x.area_id) : []
  const [cases, runs] = sprint ? await Promise.all([loadCases(areaIds), loadSprintRuns(sprint.id)]) : [[], undefined]
  const caseIds = new Set(cases.map((c) => c.id))
  const gate = sprint ? sprintGate(cases.map((c) => toStageInput(c, runs)), tickets.filter((t) => (t.case_id && caseIds.has(t.case_id)) || t.current_sprint_id === sprint.id)) : null
  const left = cases.filter((c) => caseStage(toStageInput(c, runs)) !== 'done').length
  const moved = activity.filter((a) => a.kind === 'ticket')
  const closed = moved.filter((a) => a.what.endsWith('→ closed')).length
  // Tickets created by the workbook import have no person behind them; they are not news.
  const opened = moved.filter((a) => a.what === 'opened' && a.actor_id).length
  const results = activity.filter((a) => a.kind === 'result').length
  const openHigh = tickets.filter((t) => ['Critical', 'High'].includes(t.severity) && !['closed', 'deferred', 'duplicate'].includes(t.state)).length

  return (
    <>
      <PageHeader sub={`What moved since ${fmtDate(istDate(since.toISOString()))}, what is next, and what is stuck.`}>
        {sprint && <Link href={`/sprints/${sprint.id}`} className="btn">Sprint board</Link>}
        <Link href="/tickets" className="btn">Ticket board</Link>
      </PageHeader>

      <div className="mb-5 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Stat label={running ? 'Sprint' : 'Next sprint'} value={sprint?.name ?? '—'} sub={!sprint ? 'none planned' : running ? `${daysLeft(sprint.ends_on)}` : `starts ${fmtDate(sprint.starts_on)}`} />
        <Stat label="Cases left" value={left} sub={`of ${cases.length} in ${sprint?.name ?? 'the sprint'}`} />
        <Stat label="Gate" value={gate ? `${gate.checks.filter((c) => c.ok).length}/${gate.checks.length}` : '—'} sub="close checks met" tone={gate?.ok ? 'good' : undefined} />
        <Stat label="Results recorded" value={results} sub="manual, since yesterday" />
        <Stat label="Tickets closed / opened" value={`${closed} / ${opened}`} sub="since yesterday" />
        <Stat label="Open Critical + High" value={openHigh} tone={openHigh ? 'warn' : 'good'} />
      </div>

      <StandupDeck cards={cards} unassigned={unassigned} />
    </>
  )
}
