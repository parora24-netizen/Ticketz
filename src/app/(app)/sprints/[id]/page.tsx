import Link from 'next/link'
import { notFound } from 'next/navigation'
import { SprintBoard } from '@/components/board/sprint-board'
import { EditSprintButton, ExtendSprintButton, FinishSprintButton } from '@/components/board/sprint-controls'
import { SprintProgress } from '@/components/board/sprint-progress'
import { LineChart } from '@/components/charts/line-chart'
import { Flash } from '@/components/flash'
import { SubmitButton } from '@/components/submit-button'
import { Tabs, nowSprint, sprintTabs } from '@/components/tabs'
import { Chip, PageHeader, PriorityChip, StateChip, TicketLink } from '@/components/ui'
import { getMe } from '@/lib/auth'
import {
  currentSprint, daysLeft, daysUntil, fmtDate, loadActivity, loadAreas, loadCases, loadPeople, loadRelease, loadSprintAreas, loadSprintRunTimes, loadSprintRuns,
  loadSprints, loadTasks, loadTickets, toStageInput, type CaseRow, type TicketRow,
} from '@/lib/data'
import { buildStandup, lastWorkingDayStart } from '@/lib/standup'
import { casesTestedByDay, istDate } from '@/lib/trends'
import { STAGES, caseStage, needsTicket, testBy, type Stage } from '@/lib/workflow/case-stage'
import { sprintGate } from '@/lib/workflow/sprint-gate'
import { startSprint } from '../../actions'
import { SprintForm } from '../sprint-form'

export default async function SprintPage({
  params, searchParams,
}: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params
  const sp = await searchParams
  const [me, sprints, areas, sprintAreas, people, release] = await Promise.all([
    getMe(), loadSprints(), loadAreas(), loadSprintAreas(), loadPeople(), loadRelease(),
  ])
  const sprint = sprints.find((s) => s.id === id)
  if (!sprint) notFound()
  const nowS = nowSprint(sprints, currentSprint(sprints))
  const areaIds = sprintAreas.filter((x) => x.sprint_id === id).map((x) => x.area_id)
  const now = new Date()
  const [cases, runs, allTickets, runTimes, tasks, activity] = await Promise.all([
    loadCases(areaIds), loadSprintRuns(id), loadTickets(), loadSprintRunTimes(id), loadTasks(), loadActivity(lastWorkingDayStart(now)),
  ])
  const caseIds = new Set(cases.map((c) => c.id))
  const tickets = allTickets.filter((t) => (t.case_id && caseIds.has(t.case_id)) || t.current_sprint_id === id)
  const sprintTasks = tasks.filter((t) => t.sprint_id === id)
  const gate = sprintGate(cases.map((c) => toStageInput(c, runs)), tickets, sprintTasks)
  const lead = me.role === 'lead'

  // Standup goes round the whole team in this order: blocked first, then the busiest.
  const activePeople = people.filter((p) => p.active)
  const standup = buildStandup({ now, people: activePeople.map((p) => ({ id: p.id, name: p.name, role: p.role })), activity, tickets: allTickets, tasks }).cards
    .sort((a, b) => b.blocked.length - a.blocked.length || (b.today.length + b.yesterday.length) - (a.today.length + a.yesterday.length))

  const stageOf = new Map(cases.map((c) => [c.id, caseStage(toStageInput(c, runs))]))
  const counts = Object.fromEntries(STAGES.map((s) => [s, 0])) as Record<Stage, number>
  for (const s of stageOf.values()) counts[s]++

  const ticketsByCase = new Map<string, TicketRow[]>()
  for (const t of tickets) if (t.case_id) ticketsByCase.set(t.case_id, [...(ticketsByCase.get(t.case_id) ?? []), t])
  const isOpen = (t: TicketRow) => !['closed', 'deferred', 'duplicate'].includes(t.state)
  const openTicket = (c: CaseRow) => (ticketsByCase.get(c.id) ?? []).find(isOpen)
  // Tickets moved here from an earlier sprint whose test case is not in this sprint's areas.
  const carriedIn = tickets.filter((t) => t.current_sprint_id === id && isOpen(t) && !(t.case_id && caseIds.has(t.case_id)))

  const areaName = new Map(areas.map((a) => [a.id, `${a.zone} · ${a.page}`]))
  const unfinishedAreas = [...new Set(cases.filter((c) => stageOf.get(c.id) !== 'done').map((c) => c.area_id))].map((a) => areaName.get(a) ?? '')
  const laterSprints = sprints.filter((s) => s.id !== id && s.status !== 'closed' && s.starts_on > sprint.starts_on).map((s) => ({ id: s.id, name: s.name }))

  const today = istDate(new Date().toISOString())
  const chartEnd = [sprint.ends_on, today].sort()[0]
  const daily = sprint.status !== 'planned' && chartEnd >= sprint.starts_on ? casesTestedByDay(runTimes, sprint.starts_on, chartEnd) : []

  return (
    <>
      <Tabs items={[...sprintTabs(nowS), ...(id !== nowS?.id ? [{ key: 'this', href: `/sprints/${id}`, label: `Sprint ${sprint.name}` }] : [])]} active={id === nowS?.id ? 'board' : 'this'} />
      <PageHeader
        title={`Sprint ${sprint.name}`}
        sub={<>{fmtDate(sprint.starts_on)} to {fmtDate(sprint.ends_on)} · {sprintTasks.length ? `${sprintTasks.length} tasks · ` : ''}{areaIds.length} areas · {cases.length} cases{sprint.goal ? ` · ${sprint.goal}` : ''}</>}>
        <Chip tone={sprint.status === 'active' ? 'accent' : sprint.status === 'closed' ? 'good' : 'muted'}>
          {sprint.status === 'active' ? `Running · ${daysLeft(sprint.ends_on)}` : sprint.status === 'closed' ? 'Closed' : `Planned · starts in ${Math.max(daysUntil(sprint.starts_on), 0)} days`}
        </Chip>
        {lead && sprint.status !== 'closed' && (
          <EditSprintButton><SprintForm areas={areas} sprint={sprint} selected={new Set(areaIds)} /></EditSprintButton>
        )}
        {lead && sprint.status !== 'closed' && (
          <ExtendSprintButton sprintId={id} sprints={sprints} release={{ release_on: release.release_on, go_no_go_on: release.go_no_go_on }} />
        )}
        {lead && sprint.status === 'planned' && (
          <form action={startSprint}><input type="hidden" name="sprint_id" value={id} /><SubmitButton primary pendingText="Starting…">Start sprint</SubmitButton></form>
        )}
        {lead && sprint.status === 'active' && (
          <FinishSprintButton sprintId={id} sprintName={sprint.name} checks={gate.checks} laterSprints={laterSprints} unfinishedAreas={unfinishedAreas}
            tickets={tickets.filter(isOpen).map((t) => ({ id: t.id, key: t.key, title: t.title, severity: t.severity, state: t.state }))} />
        )}
      </PageHeader>
      <Flash error={sp.error} ok={sp.ok} />

      <section className="card mb-4 grid grid-cols-1 gap-x-6 gap-y-4 p-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        {cases.length === 0 ? (
          <div className="xl:col-span-2">
            <h3 className="text-[13px] font-semibold text-[var(--navy-ink)]">Progress</h3>
            <p className="mt-1 text-[12.5px] text-[var(--muted)]">
              No test areas in this sprint: it is {sprintTasks.length ? `${sprintTasks.length} plan tasks, ${sprintTasks.filter((t) => t.status === 'done').length} done` : 'empty so far; add areas with Edit sprint or tasks from the plan'}.
            </p>
          </div>
        ) : <>
        <div>
          <SprintProgress counts={counts} />
        </div>
        <div>
          <h3 className="text-[13px] font-semibold text-[var(--navy-ink)]">Cases with a result this sprint</h3>
          {daily.length > 1
            ? <LineChart points={daily} label="Cases with a result this sprint" unit="cases" target={{ value: cases.length, label: 'all' }} height={140} />
            : <p className="mt-2 text-[12.5px] text-[var(--muted)]">{sprint.status === 'planned' ? `Fills in day by day once ${sprint.name} starts on ${fmtDate(sprint.starts_on)}.` : `${new Set(runTimes.map((r) => r.case_id)).size} of ${cases.length} so far.`}</p>}
        </div>
        </>}
        {/* Full card width so the four checks sit on one line on a desktop screen. */}
        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--line-soft)] pt-3 xl:col-span-2">
          <span className="label mr-1">Close gate</span>
          {gate.checks.map((c) => (
            <span key={c.label} title={c.detail}
              className={`chip sm:whitespace-nowrap ${c.ok ? 'border-[var(--good-line)] bg-[var(--good-soft)] text-[var(--good)]' : 'border-[var(--line)] bg-white text-[var(--ink-2)]'}`}>
              {c.ok ? '✓' : '•'} {c.label}{!c.ok && <span className="ml-1.5 font-normal text-[var(--muted)]">{c.detail}</span>}
            </span>
          ))}
        </div>
      </section>

      <SprintBoard
        role={me.role}
        meId={me.id}
        active={sprint.status === 'active'}
        people={activePeople.map((p) => ({ id: p.id, name: p.name }))}
        standup={standup}
        today={today}
        tasks={sprintTasks.map((t) => ({ id: t.id, num: t.num, phase: t.phase, title: t.title, owner: t.owner_label, owner_id: t.owner_id, due_on: t.due_on, status: t.status as 'not_started' }))}
        sprints={sprints.filter((s) => s.status !== 'closed').map((s) => ({ id: s.id, name: s.name }))}
        areas={areaIds.map((a) => areaName.get(a) ?? '').sort()}
        cards={cases.map((c) => {
          const t = openTicket(c)
          return {
            id: c.id, tc_id: c.tc_id, title: c.title, priority: c.priority, zone: c.zone, page: c.page,
            stage: stageOf.get(c.id)!, test_by: testBy(toStageInput(c)), tester_id: c.tester_id, tester_name: c.tester_name,
            auto_result: c.auto_result, manual_result: c.manual_result,
            needs_ticket: needsTicket(toStageInput(c, runs)),
            ticket: t ? { id: t.id, key: t.key, state: t.state, owner_id: t.owner_id, owner_name: t.owner_name } : null,
          }
        })}
      />

      {carriedIn.length > 0 && (
        <section className="card mt-4">
          <header className="border-b border-[var(--line)] px-4 py-2.5">
            <h3 className="text-[14px] font-semibold text-[var(--navy-ink)]">Carried into {sprint.name} · {carriedIn.length}</h3>
            <p className="text-[12px] text-[var(--muted)]">Open tickets moved here from an earlier sprint. They count toward this sprint&apos;s gate.</p>
          </header>
          <ul className="divide-y divide-[var(--row)]">
            {carriedIn.map((t) => (
              <li key={t.id} className="flex items-center gap-3 px-4 py-2 text-[12.5px]">
                <TicketLink k={t.key} />
                <span className="min-w-0 flex-1 truncate">{t.title}</span>
                <span className="hidden text-[var(--muted)] sm:inline">{t.owner_name ?? 'Unassigned'}</span>
                <StateChip s={t.state} />
                <PriorityChip p={t.severity} />
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="mt-4 text-[12px] text-[var(--muted)]">
        Every extension and spillover is recorded in the <Link href="/sprints#schedule" className="text-[var(--accent)] hover:underline">schedule log</Link>.
      </p>
    </>
  )
}
