/**
 * A sprint's clean-up: the rules the team applies by hand to its open tickets, worked out from each
 * ticket's test case results. Planning is pure, so the sprint page can show what would change
 * before anything does.
 *
 * 1. Passes both ways (by hand and in automation): close it.
 * 2. A bug whose case passes by hand but fails in automation, with an open test-issue ticket on the
 *    same case: mark the bug a duplicate of that ticket.
 * 3. Passes by hand, fails in automation: the automation owner fixes their test.
 * 4. Fails by hand, passes in automation: the case's tester takes a look.
 * 5. A ticket's case has nobody to test it: give it the chosen tester.
 */

export type CleanTicket = { id: string; key: string; kind: string; owner_id: string | null; case_id: string | null }
export type CleanCase = { id: string; tc_id: string; tester_id: string | null; manual_result: string | null; manual_at: string | null; auto_result: string | null; auto_at: string | null }
export type Step = { ticket_id: string; key: string; tc_id: string; note: string }

export type CleanupPlan = {
  close: Step[]
  duplicate: (Step & { of_id: string; of_key: string })[]
  toAutomation: Step[]
  toTester: (Step & { tester_id: string })[]
  tester: { case_id: string; tc_id: string; keys: string[] }[]
}

const FAILING = ['failed', 'known_defect']
const day = (iso: string | null) => (iso ? iso.slice(0, 10) : '?')

export function planCleanup(input: {
  tickets: CleanTicket[]
  cases: Map<string, CleanCase>
  /** Open test-issue tickets by case, from any sprint. */
  openMismatch: Map<string, { id: string; key: string }>
  automationOwner: string | null
  tester: string | null
}): CleanupPlan {
  const plan: CleanupPlan = { close: [], duplicate: [], toAutomation: [], toTester: [], tester: [] }
  const needTester = new Map<string, { case_id: string; tc_id: string; keys: string[] }>()
  for (const t of input.tickets) {
    const c = t.case_id ? input.cases.get(t.case_id) : undefined
    if (!c) continue
    const passedByHand = c.manual_result === 'passed', failedByHand = c.manual_result === 'failed'
    const autoPasses = c.auto_result === 'passed', autoFails = FAILING.includes(c.auto_result ?? '')
    const tester = c.tester_id ?? input.tester
    if (!c.tester_id && input.tester) {
      const n = needTester.get(c.id) ?? { case_id: c.id, tc_id: c.tc_id, keys: [] }
      n.keys.push(t.key)
      needTester.set(c.id, n)
    }
    if (passedByHand && autoPasses) {
      plan.close.push({ ticket_id: t.id, key: t.key, tc_id: c.tc_id, note: `Closed: ${c.tc_id} passes in automation (${day(c.auto_at)}) and by hand (${day(c.manual_at)}).` })
      continue
    }
    if (passedByHand && autoFails) {
      const twin = t.kind === 'defect' ? input.openMismatch.get(c.id) : undefined
      if (twin && twin.id !== t.id) {
        plan.duplicate.push({ ticket_id: t.id, key: t.key, tc_id: c.tc_id, of_id: twin.id, of_key: twin.key,
          note: `Duplicate of ${twin.key}: ${c.tc_id} passes by hand, so there is nothing to fix in the product. The automated test is what fails; it is tracked as ${twin.key}.` })
        continue
      }
      if (input.automationOwner && t.owner_id !== input.automationOwner) {
        plan.toAutomation.push({ ticket_id: t.id, key: t.key, tc_id: c.tc_id,
          note: `${c.tc_id} passes by hand (${day(c.manual_at)}) but the automated test reports ${c.auto_result === 'failed' ? 'a failure' : 'a known defect'}. Automation needs to fix their side.` })
      }
      continue
    }
    if (failedByHand && autoPasses && tester && t.owner_id !== tester) {
      plan.toTester.push({ ticket_id: t.id, key: t.key, tc_id: c.tc_id, tester_id: tester,
        note: `Please take a look: ${c.tc_id} failed when tested by hand (${day(c.manual_at)}) but passes in automation (${day(c.auto_at)}). Retest it by hand on the current build. If it passes, record Pass and this can be closed; if it still fails, add a note and screenshot and hand it to a developer.` })
    }
  }
  plan.tester = [...needTester.values()]
  return plan
}

/** How many changes a plan makes. */
export const planSize = (p: CleanupPlan) => p.close.length + p.duplicate.length + p.toAutomation.length + p.toTester.length + p.tester.length
