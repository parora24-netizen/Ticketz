/**
 * Who a ticket waiting in Ready for retest is with.
 *
 * It starts with the case's tester. Once they have passed the case by hand since the fix came in,
 * an automated case is only waiting for its automated run, so it moves to the ticket's owner (the
 * person running the automation, e.g. Juan) and leaves the tester's queue. A dev owner is not
 * given it back: then it stays with the tester, who should hand it on.
 */
export function retestOwner(x: {
  testerId: string | null
  ownerId: string | null
  ownerIsDev: boolean
  automated: boolean
  manualResult: string | null
  manualAt: string | null
  /** When the ticket last moved into Ready for retest. */
  readyAt: string | null
}): { id: string | null; waitingOnAutomation: boolean } {
  const passedSinceFix = x.manualResult === 'passed' && !!x.manualAt && !!x.readyAt && x.manualAt >= x.readyAt
  if (x.automated && passedSinceFix && x.ownerId && !x.ownerIsDev) return { id: x.ownerId, waitingOnAutomation: true }
  return { id: x.testerId, waitingOnAutomation: false }
}

/** The latest move into Ready for retest per ticket, from its events (oldest first or any order). */
export function readyTimes(events: { ticket_id: string; from_state: string | null; to_state: string | null; at: string }[]): Map<string, string> {
  const out = new Map<string, string>()
  for (const e of events) {
    if (e.to_state !== 'ready_for_retest' || e.from_state === 'ready_for_retest') continue
    const prev = out.get(e.ticket_id)
    if (!prev || e.at > prev) out.set(e.ticket_id, e.at)
  }
  return out
}
