/**
 * The lead's activity screens: sessions from presence pings, and one timeline of edits, ticket
 * moves, comments, results and sessions. Pure: the pages load rows, these turn them into entries.
 */

export type Session = { person_id: string; started_at: string; last_at: string; pings: number; pages: number }

/** A session lasts from its first ping to its last, plus the minute the last ping stands for. */
export function sessionMinutes(s: Pick<Session, 'started_at' | 'last_at'>): number {
  return Math.max(1, Math.round((Date.parse(s.last_at) - Date.parse(s.started_at)) / 60_000) + 1)
}

export function fmtDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} m`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h} h ${m} m` : `${h} h`
}

export type ChangeRow = {
  id: number; table_name: string; row_id: string; label: string | null
  action: 'insert' | 'update' | 'delete'; changes: Record<string, unknown>; actor_id: string | null; at: string
}

export type EntryKind = 'session' | 'edit' | 'move' | 'comment' | 'result'
export const KIND_LABEL: Record<EntryKind, string> = { session: 'Session', edit: 'Edit', move: 'Ticket move', comment: 'Comment', result: 'Result' }

export type Field = { field: string; before: string; after: string }
export type Entry = {
  key: string; kind: EntryKind; at: string; actor_id: string | null
  /** What it is about, e.g. TC_FN_070, DEV-TC_FN_070, Sprint T1. */
  ref: string | null; href: string | null
  what: string
  fields?: Field[]
  detail?: string | null
}

const TABLE: Record<string, { noun: string; href: (label: string) => string }> = {
  test_cases: { noun: 'test case', href: (l) => `/cases/${encodeURIComponent(l)}` },
  tickets: { noun: 'ticket', href: (l) => `/tickets/${encodeURIComponent(l)}` },
  sprints: { noun: 'sprint', href: (l) => `/sprints/${encodeURIComponent(l)}` },
  people: { noun: 'person', href: () => '/admin' },
}

const FIELD_LABEL: Record<string, string> = {
  tc_id: 'ID', title: 'Title', priority: 'Priority', severity: 'Severity', automation: 'Automation', area_id: 'Area',
  tester_id: 'Tester', owner_id: 'Owner', preconditions: 'Pre-conditions', steps: 'Steps', test_data: 'Test data',
  expected: 'Expected', test_type: 'Test type', source_page: 'Workbook page', description: 'Description', state: 'State',
  kind: 'Kind', case_id: 'Case', current_sprint_id: 'Sprint', found_in_sprint_id: 'Found in', fixed_in_build: 'Fixed in build',
  defer_reason: 'Defer reason', duplicate_of: 'Duplicate of', attachments: 'Screenshots', name: 'Name', email: 'Email',
  role: 'Role', active: 'Active', starts_on: 'Starts', ends_on: 'Ends', goal: 'Goal', status: 'Status',
}
/** Fields not worth a line: bookkeeping, or already shown as a ticket move. */
const SKIP = new Set(['id', 'created_at', 'created_by', 'updated_at', 'logged_on', 'key'])
const TICKET_MOVE_FIELDS = new Set(['state', 'owner_id'])

/** Turns a stored value into words, naming people, areas, sprints and cases by their ids. */
export function valueText(v: unknown, names: Map<string, string>): string {
  if (v === null || v === undefined || v === '') return '—'
  if (Array.isArray(v)) return v.length ? `${v.length} file${v.length === 1 ? '' : 's'}` : '—'
  if (typeof v === 'boolean') return v ? 'Yes' : 'No'
  const s = String(v)
  return names.get(s) ?? s.replaceAll('_', ' ')
}

/** Edits from the change log. Ticket state and owner changes are left to the ticket moves. */
export function changeEntries(rows: ChangeRow[], names: Map<string, string>): Entry[] {
  const out: Entry[] = []
  for (const r of rows) {
    const t = TABLE[r.table_name] ?? { noun: r.table_name, href: () => '' }
    const label = r.label ?? ''
    const ref = r.table_name === 'sprints' ? `Sprint ${label}` : label
    const href = r.action === 'delete' ? null : t.href(label) || null
    if (r.action === 'insert') {
      if (r.table_name === 'tickets') continue // "opened" comes from the ticket's own history
      out.push({ key: `c${r.id}`, kind: 'edit', at: r.at, actor_id: r.actor_id, ref, href, what: `added ${t.noun}`, detail: (r.changes.title as string) ?? null })
      continue
    }
    if (r.action === 'delete') {
      out.push({ key: `c${r.id}`, kind: 'edit', at: r.at, actor_id: r.actor_id, ref, href, what: `deleted ${t.noun}`, detail: (r.changes.title as string) ?? null })
      continue
    }
    const fields = Object.entries(r.changes)
      .filter(([f]) => !SKIP.has(f) && !(r.table_name === 'tickets' && TICKET_MOVE_FIELDS.has(f)))
      .map(([f, pair]) => {
        const [before, after] = Array.isArray(pair) ? pair : [null, pair]
        return { field: FIELD_LABEL[f] ?? f.replaceAll('_', ' '), before: valueText(before, names), after: valueText(after, names) }
      })
    if (!fields.length) continue
    out.push({ key: `c${r.id}`, kind: 'edit', at: r.at, actor_id: r.actor_id, ref, href, what: `edited ${t.noun}`, fields })
  }
  return out
}

export type TicketEventRow = { id: number; from_state: string | null; to_state: string | null; note: string | null; actor_id: string | null; at: string; key: string }
export function moveEntries(rows: TicketEventRow[], stateLabel: (s: string) => string): Entry[] {
  return rows.map((e) => ({
    key: `m${e.id}`, kind: 'move', at: e.at, actor_id: e.actor_id, ref: e.key, href: `/tickets/${encodeURIComponent(e.key)}`,
    what: !e.from_state ? 'opened ticket'
      : e.from_state === e.to_state ? (e.note ?? 'updated ticket')
      : `${stateLabel(e.from_state)} → ${stateLabel(e.to_state ?? '')}`,
    detail: e.from_state && e.from_state !== e.to_state ? e.note : null,
  }))
}

export function sessionEntries(rows: Session[]): Entry[] {
  return rows.map((s) => ({
    key: `s${s.person_id}${s.started_at}`, kind: 'session', at: s.started_at, actor_id: s.person_id, ref: null, href: null,
    what: `used the app for ${fmtDuration(sessionMinutes(s))}`,
    detail: `until ${new Date(s.last_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })} · ${s.pages} page${s.pages === 1 ? '' : 's'}`,
  }))
}

/** Newest first, grouped by day in India time. */
export function byDay(entries: Entry[]): { day: string; entries: Entry[] }[] {
  const sorted = [...entries].sort((a, b) => b.at.localeCompare(a.at))
  const out: { day: string; entries: Entry[] }[] = []
  for (const e of sorted) {
    const day = new Date(e.at).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })
    if (out.at(-1)?.day !== day) out.push({ day, entries: [] })
    out.at(-1)!.entries.push(e)
  }
  return out
}
