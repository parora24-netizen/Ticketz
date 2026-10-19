export type Priority = 'Critical' | 'High' | 'Medium' | 'Low'
export type Automation = 'not_automated' | 'automated' | 'manual_only'
export type RunResult = 'passed' | 'failed' | 'skipped' | 'known_defect' | 'blocked'

/** The four columns of a sprint board, in order: QA tests, devs fix, QA retests, done. */
export const STAGES = ['test', 'fix', 'retest', 'done'] as const
export type Stage = (typeof STAGES)[number]

export const STAGE_LABEL: Record<Stage, string> = {
  test: 'To test',
  fix: 'Fix',
  retest: 'Retest',
  done: 'Done',
}

export type CaseForStage = {
  priority: Priority
  automation: Automation
  auto_result: RunResult | null
  manual_result: RunResult | null
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
 * Where a case sits on the sprint board. Any recorded result counts, including the ones imported
 * from the workbook: those were real runs.
 */
export function caseStage(c: CaseForStage): Stage {
  if (c.awaiting_retest > 0) return 'retest'
  if (c.open_fix > 0 || needsTicket(c)) return 'fix'
  if (c.automation === 'automated' && c.auto_result === null) return 'test'
  if (needsManual(c) && c.manual_result === null) return 'test'
  return 'done'
}

/**
 * Test sprints (QA only, before any fixing): an area with no cases is written first, then cases
 * are automated, run and tested by hand. A failure ends here with a ticket, which a fix sprint
 * picks up. 'write' holds areas, not cases.
 */
export const TEST_STAGES = ['write', 'automate', 'test', 'passed', 'failed'] as const
export type TestStage = (typeof TEST_STAGES)[number]
export const TEST_STAGE_LABEL: Record<TestStage, string> = {
  write: 'To write', automate: 'To automate', test: 'To test', passed: 'Passed', failed: 'Failed',
}

export function testStage(c: CaseForStage): Exclude<TestStage, 'write'> {
  if (c.open_fix > 0 || c.awaiting_retest > 0 || needsTicket(c)) return 'failed'
  // Critical/High never wait on automation, as on the other boards.
  if (c.automation === 'not_automated' && !HIGH.includes(c.priority) && c.auto_result === null && c.manual_result === null) return 'automate'
  if (caseStage(c) === 'test') return 'test'
  return 'passed'
}

/** How a case in To test gets tested: by the automated suite, or by a person. */
export function testBy(c: CaseForStage): 'auto' | 'manual' {
  return c.automation === 'automated' && c.auto_result === null ? 'auto' : 'manual'
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
