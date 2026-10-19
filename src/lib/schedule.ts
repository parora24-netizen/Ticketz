/** Working-day date maths for moving sprints. Dates are plain 'YYYY-MM-DD' (calendar days, Mon–Fri working). */

const toMs = (d: string) => Date.parse(`${d}T00:00:00Z`)
const toDate = (ms: number) => new Date(ms).toISOString().slice(0, 10)
const weekend = (ms: number) => [0, 6].includes(new Date(ms).getUTCDay())

/** The date `n` working days after `d` (n may be negative). Weekends are skipped. */
export function addWorkingDays(d: string, n: number): string {
  let ms = toMs(d)
  const step = n >= 0 ? 864e5 : -864e5
  let left = Math.abs(n)
  while (left > 0) {
    ms += step
    if (!weekend(ms)) left--
  }
  return toDate(ms)
}

export type SprintDates = { id: string; name: string; starts_on: string; ends_on: string; status: string; kind?: string }

/**
 * Extending sprint `id` by `days` working days. With `cascade`, later sprints not yet closed move
 * by the same number of working days: all of them after a test sprint (fixing follows testing),
 * only fix and regression sprints after a fix sprint (testing does not wait on fixes), and the release moves if the last sprint
 * now ends on or after it. Returns the new dates; changes nothing.
 */
export function planExtension(
  sprints: SprintDates[],
  id: string,
  days: number,
  cascade: boolean,
  release: { release_on: string; go_no_go_on: string },
): { sprints: { id: string; name: string; starts_on: string; ends_on: string }[]; release: { release_on: string; go_no_go_on: string } } {
  const target = sprints.find((s) => s.id === id)
  if (!target) throw new Error('Unknown sprint')
  const changed: { id: string; name: string; starts_on: string; ends_on: string }[] = [
    { id: target.id, name: target.name, starts_on: target.starts_on, ends_on: addWorkingDays(target.ends_on, days) },
  ]
  if (cascade) {
    for (const s of sprints) {
      if (s.id === id || s.status === 'closed' || s.starts_on <= target.ends_on) continue
      if (target.kind === 'fix' && s.kind !== 'fix' && s.kind !== 'regression') continue
      changed.push({ id: s.id, name: s.name, starts_on: addWorkingDays(s.starts_on, days), ends_on: addWorkingDays(s.ends_on, days) })
    }
  }
  const lastEnd = [...sprints.filter((s) => !changed.some((c) => c.id === s.id)).map((s) => s.ends_on), ...changed.map((c) => c.ends_on)].sort().at(-1)!
  let next = release
  if (cascade && lastEnd >= release.go_no_go_on) {
    next = { release_on: addWorkingDays(release.release_on, days), go_no_go_on: addWorkingDays(release.go_no_go_on, days) }
  }
  return { sprints: changed, release: next }
}
