import { caseStage, needsTicket, testStage, type CaseForStage, type Priority } from './case-stage'
import type { TicketState } from './ticket-machine'

export type GateTicket = { state: TicketState; severity: Priority }
export type GateCheck = { label: string; ok: boolean; detail: string }

/**
 * A sprint can close only when every case in its areas has been through testing, nothing
 * is waiting on triage, and every Critical/High ticket is closed, deferred or a duplicate.
 * Medium and Low tickets still open carry over to the next sprint.
 */
/** `tasks` are the plan tasks in the sprint; a sprint with tasks also needs them done. */
export function sprintGate(cases: CaseForStage[], tickets: GateTicket[], tasks: { status: string }[] = []): { ok: boolean; checks: GateCheck[] } {
  const untested = cases.filter((c) => {
    const s = caseStage(c)
    return s === 'test'
  }).length
  const unticketed = cases.filter(needsTicket).length
  const untriaged = tickets.filter((t) => t.state === 'new' || t.state === 'triaged').length
  const highOpen = tickets.filter(
    (t) =>
      (t.severity === 'Critical' || t.severity === 'High') &&
      !['closed', 'deferred', 'duplicate'].includes(t.state),
  ).length

  const checks: GateCheck[] = [
    {
      label: 'Every case tested',
      ok: untested === 0,
      detail: untested === 0 ? `All ${cases.length} cases have results` : `${untested} cases still to test`,
    },
    {
      label: 'Every failure has a ticket',
      ok: unticketed === 0,
      detail: unticketed === 0 ? 'No manual failure is untracked' : `${unticketed} manual failures have no ticket`,
    },
    {
      label: 'Nothing waiting on triage',
      ok: untriaged === 0,
      detail: untriaged === 0 ? 'All tickets have an owner and are in fix or later' : `${untriaged} tickets new or not started`,
    },
    {
      label: 'Critical and High resolved',
      ok: highOpen === 0,
      detail: highOpen === 0 ? 'Closed, deferred or duplicate' : `${highOpen} Critical/High tickets still open`,
    },
  ]
  if (tasks.length) {
    const left = tasks.filter((t) => t.status !== 'done').length
    checks.unshift({ label: 'Every task done', ok: left === 0, detail: left === 0 ? `All ${tasks.length} tasks done` : `${left} of ${tasks.length} tasks still open` })
  }
  return { ok: checks.every((c) => c.ok), checks }
}

export type SprintKind = 'triage' | 'test' | 'fix' | 'regression'

const taskCheck = (tasks: { status: string }[]): GateCheck[] => {
  if (!tasks.length) return []
  const left = tasks.filter((t) => t.status !== 'done').length
  return [{ label: 'Every task done', ok: left === 0, detail: left === 0 ? `All ${tasks.length} tasks done` : `${left} of ${tasks.length} tasks still open` }]
}

/**
 * What a sprint needs before it closes, by type. Triage: its tasks. Test: every area has cases,
 * every case has been through testing, every failure has a ticket. Fix: its tickets triaged and
 * closed. Regression: the full check. `tickets` are the sprint's own tickets.
 */
export function gateFor(kind: SprintKind, input: { cases: CaseForStage[]; tickets: GateTicket[]; tasks?: { status: string }[]; emptyAreas?: number }): { ok: boolean; checks: GateCheck[] } {
  const { cases, tickets, tasks = [], emptyAreas = 0 } = input
  let checks: GateCheck[]
  if (kind === 'regression') return sprintGate(cases, tickets, tasks)
  if (kind === 'test') {
    const untested = cases.filter((c) => ['automate', 'test'].includes(testStage(c))).length
    const unticketed = cases.filter(needsTicket).length
    checks = [
      { label: 'Every area has cases', ok: emptyAreas === 0, detail: emptyAreas === 0 ? 'All areas have cases' : `${emptyAreas} areas have no cases yet` },
      { label: 'Every case tested', ok: untested === 0, detail: untested === 0 ? `All ${cases.length} cases have results` : `${untested} cases still to automate or test` },
      { label: 'Every failure has a ticket', ok: unticketed === 0, detail: unticketed === 0 ? 'No failure is untracked' : `${unticketed} failures have no ticket` },
    ]
  } else if (kind === 'fix') {
    const untriaged = tickets.filter((t) => t.state === 'new' || t.state === 'triaged').length
    const open = tickets.filter((t) => !['closed', 'deferred', 'duplicate'].includes(t.state)).length
    checks = [
      { label: 'Nothing waiting on triage', ok: untriaged === 0, detail: untriaged === 0 ? 'Every ticket has an owner and is in fix or later' : `${untriaged} tickets new or not started` },
      { label: 'Every ticket closed', ok: open === 0, detail: open === 0 ? `All ${tickets.length} tickets closed` : `${open} of ${tickets.length} tickets still open` },
    ]
  } else checks = []
  checks = [...taskCheck(tasks), ...checks]
  return { ok: checks.every((c) => c.ok), checks }
}
