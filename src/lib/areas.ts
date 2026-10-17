import type { CaseRow, TicketRow } from '@/lib/data'

export type AreaHealth = 'none' | 'blocked' | 'failing' | 'testing' | 'passing'

export type AreaSummary = {
  cases: number
  tested: number
  passed: number
  failed: number
  openHigh: number
  open: number
  health: AreaHealth
}

/** Roll an area's cases and tickets up into one status for the coverage grid. */
export function summarizeArea(cases: CaseRow[], tickets: TicketRow[]): AreaSummary {
  const tested = cases.filter((c) => c.manual_result || c.auto_result).length
  const passed = cases.filter((c) => (c.manual_result ?? c.auto_result) === 'passed').length
  const failed = cases.filter((c) => (c.manual_result ?? c.auto_result) === 'failed').length
  const openT = tickets.filter((t) => !['closed', 'deferred', 'duplicate'].includes(t.state))
  const openHigh = openT.filter((t) => t.severity === 'Critical' || t.severity === 'High').length
  const health: AreaHealth =
    cases.length === 0 ? 'none'
    : openHigh > 0 ? 'blocked'
    : failed > 0 || openT.length > 0 ? 'failing'
    : tested < cases.length ? 'testing'
    : 'passing'
  return { cases: cases.length, tested, passed, failed, openHigh, open: openT.length, health }
}

export const HEALTH_LABEL: Record<AreaHealth, string> = {
  none: 'No cases yet',
  blocked: 'Critical/High open',
  failing: 'Failures open',
  testing: 'Testing',
  passing: 'Passing',
}

export const HEALTH_CLASS: Record<AreaHealth, string> = {
  none: 'border-dashed border-[var(--line)] text-[var(--muted)]',
  blocked: 'border-[var(--crit)] bg-[var(--crit-soft)]',
  failing: 'border-[var(--warn)] bg-[var(--warn-soft)]',
  testing: 'border-[var(--accent)] bg-[var(--accent-soft)]',
  passing: 'border-[var(--good)] bg-[var(--good-soft)]',
}
