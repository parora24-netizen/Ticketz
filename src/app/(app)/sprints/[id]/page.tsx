import { Tabs, nowSprint, sprintTabs } from '@/components/tabs'
import { SubmitButton } from '@/components/submit-button'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CaseLink, Chip, PageHeader, PriorityChip, ResultChip, StateChip, TicketLink } from '@/components/ui'
import { Flash } from '@/components/flash'
import { getMe } from '@/lib/auth'
import { currentSprint, fmtDate, loadPeople, loadAreas, loadCases, loadSprintAreas, loadSprintRuns, loadSprints, loadTickets, toStageInput, type CaseRow, type TicketRow } from '@/lib/data'
import { STAGES, STAGE_LABEL, caseStage, needsTicket, type Stage } from '@/lib/workflow/case-stage'
import { sprintGate } from '@/lib/workflow/sprint-gate'
import { closeSprint, startSprint } from '../../actions'
import { CaseResultActions } from '@/components/case-controls'
import { SprintForm } from '../sprint-form'
import { SprintBoard } from '@/components/board/sprint-board'

const PER_COLUMN = 40

const RESULT_TEXT: Record<string, [string, string]> = {
  passed: ['Passed', 'text-[var(--good)]'], failed: ['Failed', 'text-[var(--crit)]'], blocked: ['Blocked', 'text-[var(--warn)]'],
  known_defect: ['Known defect', 'text-[var(--warn)]'], skipped: ['Skipped', 'text-[var(--muted)]'],
}
/** A result as one coloured word, so a card's results fit on one line. */
function ResultText({ r }: { r: string | null }) {
  if (!r) return <span className="text-[var(--faint)]">—</span>
  const [label, cls] = RESULT_TEXT[r] ?? [r, '']
  return <span className={`font-semibold ${cls}`}>{label}</span>
}

const STAGE_HELP: Record<Stage, string> = {
  automate: 'Automate it, or mark it manual only',
  auto_run: 'Waiting for an automated run this sprint',
  manual: 'Needs a manual result',
  fix: 'Failed; ticket open or still to raise',
  retest: 'Fixed; waiting for QA to retest',
  done: 'Tested and nothing open',
}

export default async function SprintPage({
  params, searchParams,
}: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params
  const sp = await searchParams
  const [me, sprints, areas, sprintAreas, people] = await Promise.all([getMe(), loadSprints(), loadAreas(), loadSprintAreas(), loadPeople()])
  const sprint = sprints.find((s) => s.id === id)
  if (!sprint) notFound()
  const now = nowSprint(sprints, currentSprint(sprints))
  const areaIds = sprintAreas.filter((x) => x.sprint_id === id).map((x) => x.area_id)
  const [cases, runs, allTickets] = await Promise.all([loadCases(areaIds), loadSprintRuns(id), loadTickets()])
  const caseIds = new Set(cases.map((c) => c.id))
  const tickets = allTickets.filter((t) => (t.case_id && caseIds.has(t.case_id)) || t.current_sprint_id === id)
  const gate = sprintGate(cases.map((c) => toStageInput(c, runs)), tickets)

  const columns = new Map<Stage, CaseRow[]>(STAGES.map((s) => [s, []]))
  for (const c of cases) columns.get(caseStage(toStageInput(c, runs)))!.push(c)
  const ticketsByCase = new Map<string, TicketRow[]>()
  for (const t of tickets) if (t.case_id) ticketsByCase.set(t.case_id, [...(ticketsByCase.get(t.case_id) ?? []), t])
  const openTicket = (c: CaseRow) =>
    (ticketsByCase.get(c.id) ?? []).find((t) => !['closed', 'deferred', 'duplicate'].includes(t.state))
  const back = `/sprints/${id}`
  const canRecord = me.role !== 'dev'

  return (
    <>
      <Tabs items={[...sprintTabs(now), ...(id !== now?.id ? [{ key: 'this', href: `/sprints/${id}`, label: `Sprint ${sprint.name}` }] : [])]} active={id === now?.id ? 'board' : 'this'} />
      <PageHeader
        title={`Sprint ${sprint.name}`}
        sub={<>{fmtDate(sprint.starts_on)} to {fmtDate(sprint.ends_on)} · {areaIds.length} areas · {cases.length} cases{sprint.goal ? ` · ${sprint.goal}` : ''}</>}>
        <Chip tone={sprint.status === 'active' ? 'accent' : sprint.status === 'closed' ? 'good' : 'muted'}>
          {sprint.status === 'active' ? 'Running' : sprint.status === 'closed' ? 'Closed' : 'Planned'}
        </Chip>
        {me.role === 'lead' && sprint.status === 'planned' && (
          <form action={startSprint}><input type="hidden" name="sprint_id" value={id} /><SubmitButton primary pendingText="Starting…">Start sprint</SubmitButton></form>
        )}
        {me.role === 'lead' && sprint.status === 'active' && (
          <form action={closeSprint}><input type="hidden" name="sprint_id" value={id} />
            <SubmitButton primary pendingText="Closing…" disabled={!gate.ok} title={gate.ok ? '' : 'The close gate is not met yet'}>Close sprint</SubmitButton>
          </form>
        )}
      </PageHeader>
      <Flash error={sp.error} ok={sp.ok} />

      {/* The close gate, as one strip of checks */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="label mr-1">Close gate</span>
        {gate.checks.map((c) => (
          <span key={c.label} title={c.detail}
            className={`chip ${c.ok ? 'border-[var(--good-line)] bg-[var(--good-soft)] text-[var(--good)]' : 'border-[var(--line)] bg-white text-[var(--ink-2)]'}`}>
            {c.ok ? '✓' : '•'} {c.label}<span className="ml-1.5 font-normal text-[var(--muted)]">{c.ok ? '' : c.detail}</span>
          </span>
        ))}
      </div>

      <SprintBoard
        sprintId={id}
        role={me.role}
        active={sprint.status === 'active'}
        people={people.filter((p) => p.active).map((p) => ({ id: p.id, name: p.name }))}
        sprints={sprints.filter((s) => s.status !== 'closed').map((s) => ({ id: s.id, name: s.name }))}
        cards={cases.map((c) => {
          const t = openTicket(c)
          return {
            id: c.id, tc_id: c.tc_id, title: c.title, priority: c.priority,
            stage: caseStage(toStageInput(c, runs)),
            auto_result: c.auto_result, manual_result: c.manual_result,
            needs_ticket: needsTicket(toStageInput(c, runs)),
            ticket: t ? { id: t.id, key: t.key, state: t.state, owner_name: t.owner_name } : null,
          }
        })}
      />

      {me.role === 'lead' && sprint.status !== 'closed' && (
        <details className="card mt-4 p-4">
          <summary className="cursor-pointer font-semibold">Edit dates and areas</summary>
          <div className="mt-4"><SprintForm areas={areas} sprint={sprint} selected={new Set(areaIds)} /></div>
        </details>
      )}
    </>
  )
}
