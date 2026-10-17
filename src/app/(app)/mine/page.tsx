import Link from 'next/link'
import { CaseLink, PageHeader, PriorityChip, ResultChip } from '@/components/ui'
import { getMe } from '@/lib/auth'
import { currentSprint, loadCases, loadSprintAreas, loadSprintRuns, loadSprints, loadTickets, toStageInput } from '@/lib/data'
import { caseStage, needsTicket } from '@/lib/workflow/case-stage'
import { TicketTable } from '../tickets/ticket-table'

export default async function MyWork() {
  const me = await getMe()
  const [tickets, sprints, sprintAreas] = await Promise.all([loadTickets(), loadSprints(), loadSprintAreas()])
  const sprint = currentSprint(sprints)

  if (me.role === 'dev') {
    const mine = tickets.filter((t) => t.owner_id === me.id && ['triaged', 'in_fix', 'reopened', 'new'].includes(t.state))
    const waiting = tickets.filter((t) => t.owner_id === me.id && t.state === 'ready_for_retest')
    return (
      <>
        <PageHeader title="My fixes" sub="Tickets you own. Mark each one fixed with the build number so QA can retest it." />
        <TicketTable rows={mine} empty="Nothing assigned to you." />
        <h2 className="mb-2 mt-6 font-semibold">Waiting on retest</h2>
        <TicketTable rows={waiting} empty="None of your fixes are waiting." />
      </>
    )
  }

  const retest = tickets.filter((t) => t.state === 'ready_for_retest')
  const ids = sprint ? sprintAreas.filter((x) => x.sprint_id === sprint.id).map((x) => x.area_id) : []
  const [cases, runs] = sprint ? await Promise.all([loadCases(ids), loadSprintRuns(sprint.id)]) : [[], undefined]
  const manual = cases.filter((c) => caseStage(toStageInput(c, runs)) === 'manual')
    .sort((a, b) => ['Critical', 'High', 'Medium', 'Low'].indexOf(a.priority) - ['Critical', 'High', 'Medium', 'Low'].indexOf(b.priority))
  const untracked = cases.filter((c) => needsTicket(toStageInput(c, runs)))
  const toTriage = tickets.filter((t) => t.state === 'new')

  return (
    <>
      <PageHeader title={me.role === 'lead' ? 'Lead queue' : 'My testing'} sub={sprint ? `Sprint ${sprint.name}` : 'No sprint running'} />
      <h2 className="mb-2 font-semibold">Retest queue <span className="text-[var(--muted)]">· {retest.length}</span></h2>
      <TicketTable rows={retest} empty="Nothing waiting for a retest." />

      {me.role === 'lead' && (
        <>
          <h2 className="mb-2 mt-6 font-semibold">To triage <span className="text-[var(--muted)]">· {toTriage.length}</span></h2>
          <TicketTable rows={toTriage} empty="Nothing new." />
        </>
      )}

      <h2 className="mb-2 mt-6 font-semibold">Manual tests due this sprint <span className="text-[var(--muted)]">· {manual.length}</span></h2>
      <div className="card overflow-x-auto">
        <table className="table">
          <thead><tr><th>Case</th><th>Title</th><th>Priority</th><th>Auto</th></tr></thead>
          <tbody>
            {manual.slice(0, 100).map((c) => (
              <tr key={c.id}><td><CaseLink tcId={c.tc_id} /></td><td>{c.title}</td><td><PriorityChip p={c.priority} /></td><td><ResultChip r={c.auto_result} /></td></tr>
            ))}
          </tbody>
        </table>
        {manual.length > 100 && sprint && <p className="p-3 text-sm"><Link className="text-[var(--accent)] hover:underline" href={`/cases?sprint=${sprint.id}&stage=manual`}>All {manual.length}</Link></p>}
      </div>

      {untracked.length > 0 && (
        <>
          <h2 className="mb-2 mt-6 font-semibold text-[var(--crit)]">Failures without a ticket · {untracked.length}</h2>
          <div className="card flex flex-wrap gap-2 p-3">{untracked.map((c) => <CaseLink key={c.id} tcId={c.tc_id} />)}</div>
        </>
      )}
    </>
  )
}
