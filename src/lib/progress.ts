import { needsManual, type Automation, type Priority, type RunResult } from '@/lib/workflow/case-stage'

/**
 * Test case progress, the way the workbook's Dashboard tells it: ① write the cases, ② automate
 * them, ③ test by hand what automation does not cover. Pure, for the Test cases progress page.
 */

export type ProgressArea = { id: string; zone: string; page: string; sort: number; in_release?: boolean; owner_id?: string | null; due_on?: string | null; cases_done_on?: string | null; automate_due_on?: string | null }
export type ProgressCase = { area_id: string; priority: Priority; automation: Automation; auto_result: RunResult | null; manual_result: RunResult | null }

export type Writing = 'done' | 'writing' | 'not_started'
export const WRITING_LABEL: Record<Writing, string> = { done: 'Completed', writing: 'Writing', not_started: 'Not started' }

export type Counts = {
  cases: number
  automated: number // automation status says automated
  autoRun: number // of those, with an automated result
  autoPassed: number // of those, passing in their latest run
  needManual: number // Critical/High, not automated, or automation did not pass
  manualDone: number // of those, tested by hand
  manualPassed: number // of those, passed
  untested: number // needs a manual test and has none
}

export function count(cases: ProgressCase[]): Counts {
  const c: Counts = { cases: cases.length, automated: 0, autoRun: 0, autoPassed: 0, needManual: 0, manualDone: 0, manualPassed: 0, untested: 0 }
  for (const x of cases) {
    if (x.automation === 'automated') {
      c.automated++
      if (x.auto_result) c.autoRun++
      if (x.auto_result === 'passed') c.autoPassed++
    }
    const stage = { ...x, open_fix: 0, awaiting_retest: 0 }
    if (needsManual(stage)) {
      c.needManual++
      if (x.manual_result) c.manualDone++
      else c.untested++
      if (x.manual_result === 'passed') c.manualPassed++
    }
  }
  return c
}

export type PageProgress = ProgressArea & Counts & { writing: Writing; late: boolean; automateLate: boolean }

/** Each page in the release with its counts and writing status; `today` as YYYY-MM-DD. */
export function pageProgress(areas: ProgressArea[], cases: ProgressCase[], today: string): PageProgress[] {
  const byArea = new Map<string, ProgressCase[]>()
  for (const c of cases) byArea.set(c.area_id, [...(byArea.get(c.area_id) ?? []), c])
  return areas.filter((a) => a.in_release !== false).sort((a, b) => a.sort - b.sort).map((a) => {
    const n = count(byArea.get(a.id) ?? [])
    const writing: Writing = a.cases_done_on ? 'done' : n.cases ? 'writing' : 'not_started'
    const allAutomated = n.cases > 0 && n.automated === n.cases
    return { ...a, ...n, writing, late: writing !== 'done' && !!a.due_on && a.due_on < today, automateLate: !allAutomated && !!a.automate_due_on && a.automate_due_on < today }
  })
}

export const pct = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0)

/**
 * Where cases stand on their latest results: failing if either the automated or the manual result
 * is (a known defect included), passed if one passed and neither fails. The rest are not counted.
 */
export function passFail(cases: Pick<ProgressCase, 'auto_result' | 'manual_result'>[]) {
  const n = { passed: 0, failed: 0 }
  for (const { auto_result: a, manual_result: m } of cases) {
    if (a === 'failed' || a === 'known_defect' || m === 'failed' || m === 'known_defect') n.failed++
    else if (a === 'passed' || m === 'passed') n.passed++
  }
  return n
}

/** Where a page stands at each step, as the grid's filter values: late pages are their own value. */
export function pageStatus(p: PageProgress) {
  return {
    writing: p.late ? 'Late' : WRITING_LABEL[p.writing],
    automation: !p.cases ? 'No cases' : p.automated === p.cases ? 'Fully automated' : p.automateLate ? 'Late' : p.automated ? 'Partly' : 'Not started',
    hand: !p.needManual ? 'Nothing to test' : !p.untested ? 'Done' : p.manualDone ? 'In progress' : 'Not started',
  }
}
