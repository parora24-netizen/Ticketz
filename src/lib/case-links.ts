import { caseOutcome, type ProgressCase } from '@/lib/progress'
import { needsManual, needsTicket } from '@/lib/workflow/case-stage'

/**
 * The cases behind a number on the Release pages, as filters on /cases: click 122 failed and see
 * those 122. Each uses the same rule as the count it stands behind.
 */
export type CaseLink = { outcome?: string; automation?: string; auto?: string; hand?: string; priority?: string; untracked?: string }
type LinkableCase = ProgressCase & { open_fix: number; awaiting_retest: number }

export function matchesCaseLink(c: LinkableCase, l: CaseLink): boolean {
  const need = needsManual({ ...c, open_fix: 0, awaiting_retest: 0 })
  if (l.outcome && caseOutcome(c) !== (l.outcome === 'none' ? null : l.outcome)) return false
  if (l.automation && c.automation !== l.automation) return false
  if (l.auto === 'passed' && !(c.automation === 'automated' && c.auto_result === 'passed')) return false
  if (l.hand === 'tested' && !(need && c.manual_result)) return false
  if (l.hand === 'passed' && !(need && c.manual_result === 'passed')) return false
  if (l.hand === 'left' && !(need && !c.manual_result)) return false
  if (l.priority === 'high' && !(c.priority === 'Critical' || c.priority === 'High')) return false
  if (l.untracked && !needsTicket(c)) return false
  return true
}

/** What a link shows, for the page's heading. */
export function caseLinkLabel(l: CaseLink): string {
  return [
    l.priority === 'high' && 'Critical and High',
    l.outcome === 'passed' && 'Passed',
    l.outcome === 'failed' && 'Failed',
    l.outcome === 'none' && 'No result',
    l.automation === 'automated' && 'Automated',
    l.auto === 'passed' && 'Automation passing',
    l.hand === 'tested' && 'Tested by hand',
    l.hand === 'passed' && 'Passed by hand',
    l.hand === 'left' && 'Left to test by hand',
    l.untracked && 'Failed by hand, no ticket',
  ].filter(Boolean).join(' · ')
}

/** /cases with filters, leaving out the empty ones. */
export function casesHref(l: CaseLink & { sprint?: string; area?: string }): string {
  const q = new URLSearchParams(Object.entries(l).filter((e): e is [string, string] => !!e[1])).toString()
  return q ? `/cases?${q}` : '/cases'
}
