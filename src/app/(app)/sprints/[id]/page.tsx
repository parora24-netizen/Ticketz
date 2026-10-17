import { RELEASE_TABS, Tabs, sprintTabs } from '@/components/tabs'
import { SubmitButton } from '@/components/submit-button'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { CaseLink, Chip, PageHeader, PriorityChip, ResultChip, StateChip, TicketLink } from '@/components/ui'
import { Flash } from '@/components/flash'
import { getMe } from '@/lib/auth'
import { currentSprint, fmtDate, loadAreas, loadCases, loadSprintAreas, loadSprintRuns, loadSprints, loadTickets, toStageInput, type CaseRow, type TicketRow } from '@/lib/data'
import { STAGES, STAGE_LABEL, caseStage, needsTicket, type Stage } from '@/lib/workflow/case-stage'
import { sprintGate } from '@/lib/workflow/sprint-gate'
import { closeSprint, startSprint } from '../../actions'
import { CaseResultActions } from '@/components/case-controls'
import { SprintForm } from '../sprint-form'

const PER_COLUMN = 40

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
  const [me, sprints, areas, sprintAreas] = await Promise.all([getMe(), loadSprints(), loadAreas(), loadSprintAreas()])
  const sprint = sprints.find((s) => s.id === id)
  if (!sprint) notFound()
  const nowId = currentSprint(sprints)?.id ?? null
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
      <Tabs items={[...sprintTabs(nowId), ...(id !== nowId ? [{ key: 'this', href: `/sprints/${id}`, label: `Sprint ${sprint.name}` }] : [])]} active={id === nowId ? 'board' : 'this'} />
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

      {/* The process, left to right: each column is one step every case passes through */}
      <div className="overflow-x-auto pb-2">
        <div className="grid min-w-[1180px] grid-cols-6 gap-2">
          {STAGES.map((stage, n) => {
            const list = columns.get(stage)!
            return (
              <section key={stage} className="flex min-w-0 flex-col bg-[var(--surface-2)]">
                <header className={`border-t-2 px-2.5 pt-2 pb-2 ${list.length && stage !== 'done' ? 'border-[var(--navy)]' : 'border-[var(--line)]'}`}>
                  <div className="flex items-baseline justify-between">
                    <h3 className="text-[12.5px] font-semibold text-[var(--navy-ink)]"><span className="mono mr-1.5 text-[11px] text-[var(--faint)]">{n + 1}</span>{STAGE_LABEL[stage]}</h3>
                    <span className="mono text-[11.5px] text-[var(--muted)]">{list.length}</span>
                  </div>
                  <p className="text-[11px] leading-snug text-[var(--muted)]">{STAGE_HELP[stage]}</p>
                </header>
                <div className="max-h-[calc(100vh-330px)] min-h-24 space-y-1.5 overflow-y-auto px-1.5 pb-1.5">
                  {list.slice(0, PER_COLUMN).map((c) => {
                    const t = openTicket(c)
                    return (
                      <article key={c.id} className={`border border-[var(--line)] bg-white p-2 ${
                        c.priority === 'Critical' ? 'shadow-[inset_3px_0_0_var(--crit)]' : c.priority === 'High' ? 'shadow-[inset_3px_0_0_var(--warn)]' : ''}`}>
                        <div className="flex items-center justify-between gap-2">
                          <CaseLink tcId={c.tc_id} /><PriorityChip p={c.priority} />
                        </div>
                        <p className="mt-1 line-clamp-2 text-[12.5px] leading-snug">{c.title}</p>
                        <div className="mt-1.5 flex flex-wrap items-center gap-1 text-[11px] text-[var(--faint)]">
                          <span>Auto</span><ResultChip r={c.auto_result} /><span className="ml-1">Manual</span><ResultChip r={c.manual_result} />
                        </div>
                        {t && <div className="mt-1.5 flex items-center gap-1.5"><TicketLink k={t.key} /><StateChip s={t.state} /></div>}
                        {stage === 'fix' && needsTicket(toStageInput(c, runs)) && (
                          <Link href={`/cases/${c.tc_id}#ticket`} className="mt-1.5 block text-[11.5px] font-semibold text-[var(--crit)] hover:underline">Raise a ticket</Link>
                        )}
                        {stage === 'manual' && canRecord && sprint.status === 'active' && (
                          <div className="mt-2 flex gap-1"><CaseResultActions caseId={c.id} size="sm" /></div>
                        )}
                      </article>
                    )
                  })}
                  {list.length === 0 && <p className="px-1 py-3 text-center text-[11.5px] text-[var(--faint)]">Empty</p>}
                  {list.length > PER_COLUMN && (
                    <Link href={`/cases?sprint=${id}&stage=${stage}`} className="block px-1 py-1 text-[12px] text-[var(--accent)] hover:underline">
                      All {list.length} in the grid
                    </Link>
                  )}
                </div>
              </section>
            )
          })}
        </div>
      </div>

      {me.role === 'lead' && sprint.status !== 'closed' && (
        <details className="card mt-4 p-4">
          <summary className="cursor-pointer font-semibold">Edit dates and areas</summary>
          <div className="mt-4"><SprintForm areas={areas} sprint={sprint} selected={new Set(areaIds)} /></div>
        </details>
      )}
    </>
  )
}
