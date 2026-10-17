import { caseStage, needsTicket, type CaseForStage, type Priority } from './case-stage'
import type { TicketState } from './ticket-machine'

export type GateTicket = { state: TicketState; severity: Priority }
export type GateCheck = { label: string; ok: boolean; detail: string }

/**
 * A sprint can close only when every case in its areas has been through testing, nothing
 * is waiting on triage, and every Critical/High ticket is closed, deferred or a duplicate.
 * Medium and Low tickets still open carry over to the next sprint.
 */
export function sprintGate(cases: CaseForStage[], tickets: GateTicket[]): { ok: boolean; checks: GateCheck[] } {
  const untested = cases.filter((c) => {
    const s = caseStage(c)
    return s === 'automate' || s === 'auto_run' || s === 'manual'
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
      detail: untested === 0 ? `All ${cases.length} cases have results` : `${untested} cases still to automate or test`,
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
  return { ok: checks.every((c) => c.ok), checks }
}
