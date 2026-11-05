/**
 * The names people use in a direction, turned into what they mean: "sprint 4" is S4, "data exporter"
 * is that zone's pages, "me" is whoever is asking. Anything unclear comes back as an error naming the
 * choices, for the assistant to ask about rather than guess.
 */
type Found<T> = { value: T; error?: undefined } | { error: string; value?: undefined }
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ')
const list = (names: string[]) => names.slice(0, 12).join(', ')

/** The one name that matches: exactly if any does, else the one containing it. */
function pick<T>(q: string, items: T[], name: (t: T) => string, what: string): Found<T> {
  const n = norm(q)
  const exact = items.filter((t) => norm(name(t)) === n)
  const hits = exact.length ? exact : items.filter((t) => norm(name(t)).includes(n))
  if (hits.length === 1) return { value: hits[0] }
  if (hits.length) return { error: `"${q}" could be ${list(hits.map(name))}. Which ${what}?` }
  return { error: `No ${what} called "${q}". There are: ${list(items.map(name))}.` }
}

/** A sprint by name or number; `null` for "no sprint". */
export function resolveSprint<S extends { name: string }>(q: string, sprints: S[]): Found<S | null> {
  const n = norm(q)
  if (['none', 'no sprint', 'not planned', 'unplanned'].includes(n)) return { value: null }
  const number = /^(?:sprint\s*|s)?(\d+)$/.exec(n)?.[1]
  return pick(number ? `S${number}` : q, sprints, (s) => s.name, 'sprint')
}

/** A person by name, "me", or `null` for "no one". */
export function resolvePerson<P extends { id: string; name: string }>(q: string, people: P[], meId: string): Found<P | null> {
  const n = norm(q)
  if (['none', 'no one', 'nobody', 'unassigned'].includes(n)) return { value: null }
  if (['me', 'myself'].includes(n)) {
    const me = people.find((p) => p.id === meId)
    return me ? { value: me } : { error: 'You are not on the team list.' }
  }
  return pick(q, people, (p) => p.name, 'person')
}

/** Pages by whole zones and by page name ("Create" or "My Flow · Create"), each page once. */
export function resolvePages<A extends { id: string; zone: string; page: string }>(want: { zones?: string[]; pages?: string[] }, areas: A[]): Found<A[]> {
  const out = new Map<string, A>()
  const zones = [...new Set(areas.map((a) => a.zone))]
  for (const z of want.zones ?? []) {
    const hit = pick(z, zones, (x) => x, 'zone')
    if (hit.error !== undefined) return { error: hit.error }
    for (const a of areas.filter((x) => x.zone === hit.value)) out.set(a.id, a)
  }
  for (const p of want.pages ?? []) {
    const hit = pick(p, areas, (a) => (/[·/]/.test(p) ? `${a.zone} · ${a.page}` : a.page), 'page')
    if (hit.error === undefined) { out.set(hit.value.id, hit.value); continue }
    // The same page name in two zones is worth asking about by its full name.
    const same = areas.filter((a) => norm(a.page) === norm(p))
    return { error: same.length > 1 ? `"${p}" is in more than one zone: ${list(same.map((a) => `${a.zone} · ${a.page}`))}. Which one?` : hit.error }
  }
  return out.size ? { value: [...out.values()] } : { error: 'Which pages or zones?' }
}
