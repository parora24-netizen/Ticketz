/** Day-by-day series for the release overview. Pure, so it is unit-tested. */

export type Point = { date: string; value: number }
type Ev = { ticket_id: string; to_state: string; at: string }
type Tk = { id: string; severity: string; logged_on: string; state: string }

const RESOLVED = new Set(['closed', 'deferred', 'duplicate'])

export function days(from: string, to: string): string[] {
  const out: string[] = []
  for (let d = Date.parse(`${from}T00:00:00Z`); d <= Date.parse(`${to}T00:00:00Z`); d += 864e5) out.push(new Date(d).toISOString().slice(0, 10))
  return out
}

/** India date of a timestamp (the team's working day). */
export const istDate = (iso: string) => new Date(Date.parse(iso) + 330 * 60_000).toISOString().slice(0, 10)

/**
 * How many tickets of the given severities were open at the end of each day. A ticket counts from
 * its logged date; resolving moves (closed, deferred, duplicate) end it, reopening starts it again.
 */
export function openTicketsByDay(tickets: Tk[], events: Ev[], severities: string[], from: string, to: string): Point[] {
  const byTicket = new Map<string, Ev[]>()
  for (const e of events) byTicket.set(e.ticket_id, [...(byTicket.get(e.ticket_id) ?? []), e])
  const range = days(from, to)
  const counts = new Array(range.length).fill(0)
  for (const t of tickets.filter((x) => severities.includes(x.severity))) {
    const evs = (byTicket.get(t.id) ?? []).filter((e) => e.to_state).sort((a, b) => a.at.localeCompare(b.at))
    range.forEach((day, i) => {
      if (t.logged_on > day) return
      const last = evs.filter((e) => istDate(e.at) <= day).at(-1)
      const open = last ? !RESOLVED.has(last.to_state) : true
      if (open) counts[i]++
    })
  }
  return range.map((date, i) => ({ date, value: counts[i] }))
}

/** Distinct cases with a manual result recorded on or before each day (optionally only passes as their latest). */
export function casesTestedByDay(runs: { case_id: string; result: string; recorded_at: string }[], from: string, to: string): Point[] {
  const sorted = [...runs].sort((a, b) => a.recorded_at.localeCompare(b.recorded_at))
  return days(from, to).map((date) => {
    const seen = new Set<string>()
    for (const r of sorted) {
      if (istDate(r.recorded_at) > date) break
      seen.add(r.case_id)
    }
    return { date, value: seen.size }
  })
}
