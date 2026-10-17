export type Priority = 'Critical' | 'High' | 'Medium' | 'Low'
export type Automation = 'not_automated' | 'automated' | 'manual_only'
export type RunResult = 'passed' | 'failed' | 'skipped' | 'known_defect' | 'blocked'

/** The six columns of a sprint board, in order. */
export const STAGES = ['automate', 'auto_run', 'manual', 'fix', 'retest', 'done'] as const
export type Stage = (typeof STAGES)[number]

export const STAGE_LABEL: Record<Stage, string> = {
  automate: 'Automate',
  auto_run: 'Automated run',
  manual: 'Manual test',
  fix: 'Fix',
  retest: 'Retest',
  done: 'Closed',
}

export type CaseForStage = {
  priority: Priority
  automation: Automation
  auto_result: RunResult | null
  manual_result: RunResult | null
  /** An automated result was posted during this sprint. */
  auto_in_sprint: boolean
  /** A manual result was recorded during this sprint. */
  manual_in_sprint: boolean
  open_fix: number
  awaiting_retest: number
}

const HIGH: Priority[] = ['Critical', 'High']

/**
 * Manual testing is needed for every Critical/High case, for anything not automated,
 * and for anything automation could not pass.
 */
export function needsManual(c: CaseForStage): boolean {
  if (HIGH.includes(c.priority)) return true
  if (c.automation !== 'automated') return true
  return c.auto_result !== 'passed'
}

/** A manual failure with no ticket tracking it. */
export function needsTicket(c: CaseForStage): boolean {
  return c.manual_result === 'failed' && c.open_fix === 0 && c.awaiting_retest === 0
}

/**
 * Where a case sits on the sprint board.
 * Critical/High cases must be tested again inside the sprint; Medium/Low may rely on an
 * earlier result, so a sprint over a large area stays achievable.
 */
export function caseStage(c: CaseForStage): Stage {
  if (c.awaiting_retest > 0) return 'retest'
  if (c.open_fix > 0 || needsTicket(c)) return 'fix'
  const high = HIGH.includes(c.priority)
  const hasAuto = high ? c.auto_in_sprint : c.auto_result !== null
  const hasManual = high ? c.manual_in_sprint : c.manual_result !== null
  if (c.automation === 'not_automated' && !hasAuto && !hasManual) return 'automate'
  if (c.automation === 'automated' && !hasAuto) return 'auto_run'
  if (needsManual(c) && !hasManual) return 'manual'
  return 'done'
}

/**
 * Automation and manual testing disagree. Type I: automation failed (or marked a known defect)
 * but a person passed it. Type II: automation passed but a person failed it, so the automated
 * test is not checking what matters.
 */
export function mismatch(auto: RunResult | null, manual: RunResult | null): 'type_i' | 'type_ii' | null {
  if (!auto || !manual) return null
  if ((auto === 'failed' || auto === 'known_defect') && manual === 'passed') return 'type_i'
  if (auto === 'passed' && manual === 'failed') return 'type_ii'
  return null
}
