/**
 * Summaries of what changed over a period, for the assistant's history tools. Pure: the rows are
 * fetched elsewhere, under the asker's own access, so this can be tested on its own.
 */

/** Days in the data are India time; a day runs from its midnight there. */
export const indiaDayStart = (day: string) => new Date(`${day}T00:00:00+05:30`).toISOString()
export const indiaNextDayStart = (day: string) => new Date(Date.parse(`${day}T00:00:00+05:30`) + 864e5).toISOString()
export const indiaDay = (at: string) => new Date(Date.parse(at) + 330 * 60_000).toISOString().slice(0, 10)

export type ChangeRow = {
  row_id: string
  action: string
  at: string
  actor_id: string | null
  changes: Record<string, unknown> | null
}
/** What a logged row is now, or undefined if it has since been deleted. */
export type ChangeItem = { id: string; area: string | null; current?: string | null }

const tally = (values: (string | null | undefined)[]) => {
  const m = new Map<string, number>()
  for (const v of values) { const k = v || '(none)'; m.set(k, (m.get(k) ?? 0) + 1) }
  return Object.fromEntries([...m.entries()].sort((a, b) => b[1] - a[1]))
}

/** A logged update of one field is [old, new]. */
const newValue = (r: ChangeRow, field: string) => {
  const v = r.changes?.[field]
  return Array.isArray(v) && v.length === 2 ? (v[1] as unknown) : undefined
}
const oldValue = (r: ChangeRow, field: string) => {
  const v = r.changes?.[field]
  return Array.isArray(v) && v.length === 2 ? (v[0] as unknown) : undefined
}
const text = (v: unknown) => (v === null || v === undefined ? null : String(v))

/**
 * Filters to one field's changes when given (optionally to and from a value), and counts what is left.
 * `items` is how many different cases or tickets; one can change more than once. `still_that_value`
 * is how many hold the `to` value now, so a later change back is not counted as if it stuck.
 */
export function summarizeChanges(rows: ChangeRow[], items: Map<string, ChangeItem>, names: (id: string | null) => string | null, f: { field?: string; to?: string; from?: string; zone?: string; page?: string }) {
  const area = (r: ChangeRow) => items.get(r.row_id)?.area ?? null
  const has = (hay: string | null, needle?: string) => !needle || (hay ?? '').toLowerCase().includes(needle.toLowerCase())
  const kept = rows.filter((r) => {
    const a = area(r)
    const [zone, page] = (a ?? '').split(' · ')
    if (!has(zone, f.zone) || !has(page ?? '', f.page)) return false
    if (!f.field) return true
    if (newValue(r, f.field) === undefined && oldValue(r, f.field) === undefined) return false
    const matches = (v: unknown, want?: string) => !want || (text(v) ?? '').toLowerCase() === want.toLowerCase() || (names(text(v)) ?? '').toLowerCase() === want.toLowerCase()
    return matches(newValue(r, f.field), f.to) && matches(oldValue(r, f.field), f.from)
  })
  const ids = [...new Set(kept.map((r) => r.row_id))]
  return {
    changes: kept.length,
    items: ids.length,
    ...(f.to ? { still_that_value: ids.filter((id) => (items.get(id)?.current ?? '').toLowerCase() === f.to!.toLowerCase()).length } : {}),
    by_day: Object.fromEntries(Object.entries(tally(kept.map((r) => indiaDay(r.at)))).sort(([a], [b]) => a.localeCompare(b))),
    by_area: tally(kept.map((r) => (items.has(r.row_id) ? area(r) : '(since deleted)'))),
    by_person: tally(kept.map((r) => (r.actor_id ? names(r.actor_id) : 'automation or a system change'))),
    ...(f.field
      ? { by_change: tally(kept.map((r) => `${names(text(oldValue(r, f.field!))) ?? text(oldValue(r, f.field!)) ?? '(none)'} -> ${names(text(newValue(r, f.field!))) ?? text(newValue(r, f.field!)) ?? '(none)'}`)) }
      : { by_action: tally(kept.map((r) => r.action)), by_field: tally(kept.flatMap((r) => (r.action === 'update' ? Object.keys(r.changes ?? {}) : []))) }),
    ids,
  }
}

export type ResultRow = { case_id: string; result: string; run_id: string | null; recorded_at: string; who: string | null }

/** Results recorded over a period: how many, of what, where and from which run. */
export function summarizeResults(rows: ResultRow[], areaOf: (caseId: string) => string | null) {
  return {
    results: rows.length,
    cases: new Set(rows.map((r) => r.case_id)).size,
    by_result: tally(rows.map((r) => r.result)),
    by_day: Object.fromEntries(Object.entries(tally(rows.map((r) => indiaDay(r.recorded_at)))).sort(([a], [b]) => a.localeCompare(b))),
    by_area: tally(rows.map((r) => areaOf(r.case_id))),
    by_person: tally(rows.map((r) => r.who)),
    runs: new Set(rows.flatMap((r) => (r.run_id ? [r.run_id] : []))).size,
  }
}
