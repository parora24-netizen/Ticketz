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
import { closeSprint, recordManualResult, startSprint } from '../../actions'
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

      <section className="card mb-5 p-4">
        <h2 className="font-semibold">Close gate {gate.ok ? <span className="text-[var(--good)]">· met</span> : <span className="text-[var(--muted)]">· not met</span>}</h2>
        <ul className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {gate.checks.map((c) => (
            <li key={c.label} className={`rounded-[2px] border p-2 text-sm ${c.ok ? 'border-[var(--good)]' : 'border-[var(--line)]'}`}>
              <span className={c.ok ? 'text-[var(--good)]' : 'text-[var(--warn)]'}>{c.ok ? '✓ ' : '• '}</span>{c.label}
              <span className="block text-xs text-[var(--muted)]">{c.detail}</span>
            </li>
          ))}
        </ul>
      </section>

      <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
        {STAGES.map((stage) => {
          const list = columns.get(stage)!
          return (
            <section key={stage} className="flex min-w-0 flex-col rounded-[2px] bg-[var(--surface-2)] p-2">
              <header className="px-1 pb-2">
                <div className="flex items-baseline justify-between">
                  <h3 className="font-semibold">{STAGE_LABEL[stage]}</h3>
                  <span className="tabular-nums text-sm text-[var(--muted)]">{list.length}</span>
                </div>
                <p className="text-xs text-[var(--muted)]">{STAGE_HELP[stage]}</p>
              </header>
              <div className="space-y-2">
                {list.slice(0, PER_COLUMN).map((c) => {
                  const t = openTicket(c)
                  return (
                    <article key={c.id} className="card p-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <CaseLink tcId={c.tc_id} /><PriorityChip p={c.priority} />
                      </div>
                      <p className="mt-1 line-clamp-2 text-sm">{c.title}</p>
                      <div className="mt-1.5 flex flex-wrap items-center gap-1 text-xs text-[var(--muted)]">
                        Auto <ResultChip r={c.auto_result} /> Manual <ResultChip r={c.manual_result} />
                      </div>
                      {t && <div className="mt-1.5 flex items-center gap-1.5"><TicketLink k={t.key} /><StateChip s={t.state} /></div>}
                      {stage === 'fix' && needsTicket(toStageInput(c, runs)) && (
                        <Link href={`/cases/${c.tc_id}#ticket`} className="mt-1.5 block text-xs font-medium text-[var(--crit)] hover:underline">Raise a ticket</Link>
                      )}
                      {stage === 'manual' && canRecord && sprint.status === 'active' && (
                        <form action={recordManualResult} className="mt-2 flex gap-1">
                          <input type="hidden" name="case_id" value={c.id} />
                          <input type="hidden" name="back" value={back} />
                          <input type="hidden" name="raise_ticket" value="1" />
                          <SubmitButton small name="result" value="passed" pendingText="…" className="flex-1">Pass</SubmitButton>
                          <SubmitButton small name="result" value="failed" pendingText="…" className="flex-1">Fail</SubmitButton>
                          <SubmitButton small name="result" value="blocked" pendingText="…" className="flex-1">Blocked</SubmitButton>
                        </form>
                      )}
                    </article>
                  )
                })}
                {list.length > PER_COLUMN && (
                  <Link href={`/cases?sprint=${id}&stage=${stage}`} className="block px-1 py-1 text-sm text-[var(--accent)] hover:underline">
                    All {list.length} in {STAGE_LABEL[stage]}
                  </Link>
                )}
              </div>
            </section>
          )
        })}
      </div>

      {me.role === 'lead' && sprint.status !== 'closed' && (
        <details className="card mt-6 p-4">
          <summary className="cursor-pointer font-semibold">Edit dates and areas</summary>
          <div className="mt-4"><SprintForm areas={areas} sprint={sprint} selected={new Set(areaIds)} /></div>
        </details>
      )}
    </>
  )
}
