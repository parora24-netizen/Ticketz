import { sprintHref } from '@/lib/links'
import { notFound } from 'next/navigation'
import { SprintBoard } from '@/components/board/sprint-board'
import { EditSprintButton, ExtendSprintButton, FinishSprintButton } from '@/components/board/sprint-controls'
import { SprintProgress } from '@/components/board/sprint-progress'
import { LineChart } from '@/components/charts/line-chart'
import { Flash } from '@/components/flash'
import { SubmitButton } from '@/components/submit-button'
import { Tabs, nowSprints, sprintTabs } from '@/components/tabs'
import { Chip, PageHeader, PriorityChip, StateChip, TicketLink } from '@/components/ui'
import { getMe } from '@/lib/auth'
import {
  runningSprints, daysLeft, daysUntil, fmtDate, loadActivity, loadAreas, loadHolidays, loadCases, loadPeople, loadRelease, loadSprintAreas, loadSprintRunTimes, loadSprintRuns,
  loadSprints, loadTasks, loadTickets, toStageInput, type CaseRow, type TicketRow,
} from '@/lib/data'
import { buildStandup, lastWorkingDayStart } from '@/lib/standup'
import { casesTestedByDay, istDate } from '@/lib/trends'
import { STAGES, TEST_STAGES, caseStage, needsTicket, testBy, testStage } from '@/lib/workflow/case-stage'
import { gateFor } from '@/lib/workflow/sprint-gate'
import { FIX_STAGES, fixStage } from '@/lib/workflow/board-moves'
import { startSprint } from '../../actions'
import { SprintForm } from '../sprint-form'

export default async function SprintPage({
  params, searchParams,
}: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id: param } = await params
  const sp = await searchParams
  const [me, sprints, areas, sprintAreas, people, release, holidays] = await Promise.all([
    getMe(), loadSprints(), loadAreas(), loadSprintAreas(), loadPeople(), loadRelease(), loadHolidays(),
  ])
  // Opened by name (/sprints/T1) or, for older links, by id.
  const wanted = decodeURIComponent(param).toLowerCase()
  const sprint = sprints.find((s) => s.id === param || s.name.toLowerCase() === wanted)
  if (!sprint) notFound()
  const id = sprint.id
  const nowS = nowSprints(sprints, runningSprints(sprints))
  const areaIds = sprintAreas.filter((x) => x.sprint_id === id).map((x) => x.area_id)
  const now = new Date()
  // Fix sprints have no areas: their board is the cases behind their tickets.
  const [loaded, runs, allTickets, runTimes, tasks, activity] = await Promise.all([
    sprint.kind === 'fix' ? loadCases() : loadCases(areaIds), loadSprintRuns(id), loadTickets(), loadSprintRunTimes(id), loadTasks(), loadActivity(lastWorkingDayStart(now)),
  ])
  // The sprint's own tickets: fix sprints are made of them; test sprints raise them for later.
  const tickets = allTickets.filter((t) => t.current_sprint_id === id)
  const ticketCases = new Set(tickets.map((t) => t.case_id).filter(Boolean))
  const cases = sprint.kind === 'fix' ? loaded.filter((c) => ticketCases.has(c.id)) : loaded
  const caseIds = new Set(cases.map((c) => c.id))
  const kind = sprint.kind
  const testMode = kind === 'test'
  const casesWithArea = new Set(cases.map((c) => c.area_id))
  const emptyAreaIds = testMode ? areaIds.filter((a) => !casesWithArea.has(a)) : []
  const gate = gateFor(kind, { cases: cases.map((c) => toStageInput(c, runs)), tickets, emptyAreas: emptyAreaIds.length })
  const lead = me.role === 'lead'

  // Standup goes round the whole team in this order: blocked first, then the busiest.
  const activePeople = people.filter((p) => p.active)
  const standup = buildStandup({ now, people: activePeople.map((p) => ({ id: p.id, name: p.name, role: p.role })), activity, tickets: allTickets, tasks }).cards
    .sort((a, b) => b.blocked.length - a.blocked.length || (b.today.length + b.yesterday.length) - (a.today.length + a.yesterday.length))

  // Fix sprints follow each case's ticket in this sprint (an open one first).
  const sprintTicketOf = (caseId: string) => {
    const mine = tickets.filter((t) => t.case_id === caseId)
    return mine.find((t) => !['closed', 'deferred', 'duplicate'].includes(t.state)) ?? mine[0]
  }
  const fixMode = kind === 'fix'
  const stageOf = new Map<string, string>(cases.map((c) => [c.id,
    fixMode ? fixStage(sprintTicketOf(c.id)!.state) : testMode ? testStage(toStageInput(c, runs)) : caseStage(toStageInput(c, runs))]))
  const counts: Record<string, number> = Object.fromEntries((fixMode ? FIX_STAGES : testMode ? TEST_STAGES : STAGES).map((s) => [s, 0]))
  for (const s of stageOf.values()) counts[s]++
  if (testMode) counts.write = emptyAreaIds.length

  const ticketsByCase = new Map<string, TicketRow[]>()
  for (const t of allTickets) if (t.case_id) ticketsByCase.set(t.case_id, [...(ticketsByCase.get(t.case_id) ?? []), t])
  const isOpen = (t: TicketRow) => !['closed', 'deferred', 'duplicate'].includes(t.state)
  const openTicket = (c: CaseRow) => (ticketsByCase.get(c.id) ?? []).find(isOpen)
  // Tickets moved here from an earlier sprint whose test case is not in this sprint's areas.
  const carriedIn = tickets.filter((t) => t.current_sprint_id === id && isOpen(t) && !(t.case_id && caseIds.has(t.case_id)))

  const areaName = new Map(areas.map((a) => [a.id, `${a.zone} · ${a.page}`]))
  const unfinishedAreas = [...new Set([...emptyAreaIds, ...cases.filter((c) => !['done', 'passed'].includes(stageOf.get(c.id)!)).map((c) => c.area_id)])].map((a) => areaName.get(a) ?? '')
  const laterSprints = sprints.filter((s) => s.id !== id && s.status !== 'closed' && s.starts_on > sprint.starts_on).map((s) => ({ id: s.id, name: s.name }))

  const today = istDate(new Date().toISOString())
  const chartEnd = [sprint.ends_on, today].sort()[0]
  const daily = sprint.status !== 'planned' && chartEnd >= sprint.starts_on ? casesTestedByDay(runTimes, sprint.starts_on, chartEnd) : []

  return (
    <>
      <Tabs items={[...sprintTabs(nowS), ...(nowS.some((n) => n.id === id) ? [] : [{ key: id, href: sprintHref(sprint), label: `Sprint ${sprint.name}` }])]} active={id} />
      <PageHeader
        title={`Sprint ${sprint.name}`}
        sub={[`${fmtDate(sprint.starts_on)} to ${fmtDate(sprint.ends_on)}`, areaIds.length && `${areaIds.length} areas · ${cases.length} cases`, sprint.goal].filter(Boolean).join(' · ')}>
        <Chip tone={sprint.status === 'active' ? 'accent' : sprint.status === 'closed' ? 'good' : 'muted'}>
          {sprint.status === 'active' ? `Running · ${daysLeft(sprint.ends_on)}` : sprint.status === 'closed' ? 'Closed' : `Planned · starts in ${Math.max(daysUntil(sprint.starts_on), 0)} days`}
        </Chip>
        {lead && sprint.status !== 'closed' && (
          <EditSprintButton><SprintForm areas={areas} sprint={sprint} selected={new Set(areaIds)} /></EditSprintButton>
        )}
        {lead && sprint.status !== 'closed' && (
          <ExtendSprintButton sprintId={id} sprints={sprints} holidays={holidays.map((h) => h.day)} release={{ release_on: release.release_on, go_no_go_on: release.go_no_go_on }} />
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

      {cases.length > 0 && (
      <section className="card mb-4 grid grid-cols-1 gap-x-6 gap-y-4 p-4 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <>
        <div>
          <SprintProgress counts={counts} mode={fixMode ? 'fix' : testMode ? 'test' : 'cases'} />
        </div>
        <div>
          <h3 className="text-[13px] font-semibold text-[var(--navy-ink)]">Cases with a result this sprint</h3>
          {daily.length > 1
            ? <LineChart points={daily} label="Cases with a result this sprint" unit="cases" target={{ value: cases.length, label: 'all' }} height={140} />
            : <p className="mt-2 text-[12.5px] text-[var(--muted)]">{new Set(runTimes.map((r) => r.case_id)).size} of {cases.length}</p>}
        </div>
        </>
      </section>
      )}

      <SprintBoard
        mode={fixMode ? 'fix' : testMode ? 'test' : 'cases'}
        emptyAreas={emptyAreaIds.map((a) => ({ id: a, label: areaName.get(a) ?? '' }))}
        role={me.role}
        meId={me.id}
        active={sprint.status === 'active'}
        people={activePeople.map((p) => ({ id: p.id, name: p.name }))}
        standup={standup}
        sprintId={id}
        today={today}
        sprints={sprints.filter((s) => s.status !== 'closed').map((s) => ({ id: s.id, name: s.name }))}
        areas={areaIds.map((a) => areaName.get(a) ?? '').sort()}
        cards={cases.map((c) => {
          const t = fixMode ? sprintTicketOf(c.id) : openTicket(c)
          return {
            id: c.id, tc_id: c.tc_id, title: c.title, priority: c.priority, zone: c.zone, page: c.page,
            stage: stageOf.get(c.id)! as 'test', test_by: testBy(toStageInput(c)), tester_id: c.tester_id, tester_name: c.tester_name,
            auto_result: c.auto_result, manual_result: c.manual_result,
            needs_ticket: needsTicket(toStageInput(c, runs)),
            ticket: t ? { id: t.id, key: t.key, state: t.state, owner_id: t.owner_id, owner_name: t.owner_name, kind: t.kind } : null,
          }
        })}
      />

      {kind !== 'fix' && carriedIn.length > 0 && (
        <section className="card mt-4">
          <header className="border-b border-[var(--line)] px-4 py-2.5">
            <h3 className="text-[14px] font-semibold text-[var(--navy-ink)]">Carried into {sprint.name} · {carriedIn.length}</h3>
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

    </>
  )
}
