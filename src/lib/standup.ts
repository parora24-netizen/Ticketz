/**
 * Builds the standup: for each person, what they did since the last working day started,
 * what is on their plate now, and what is stuck. Pure, so it is unit-tested.
 * Days are counted in India time, where most of the team works.
 */

export type ActivityRow = {
  kind: 'ticket' | 'comment' | 'result' | 'case' | 'task'
  at: string
  actor_id: string | null
  subject_owner_id: string | null
  ref: string
  title: string
  what: string
  detail: string | null
}
export type StandupPerson = { id: string; name: string; role: 'lead' | 'dev' | 'qa' }
export type StandupTicket = {
  id: string; key: string; title: string; state: string; severity: string
  owner_id: string | null; updated_at: string
}
export type StandupTask = { id: string; num: number; title: string; status: string; due_on: string; owner_id: string | null }

export type StandupItem = { ref: string; title: string; note: string; href: string; tone?: 'crit' | 'warn' }
export type StandupCard = {
  person: StandupPerson
  yesterday: { ref: string; title: string; what: string; at: string; href: string }[]
  today: StandupItem[]
  blocked: StandupItem[]
}

const TZ_OFFSET_MIN = 330 // IST, UTC+5:30

/** Midnight (India time) at the start of the last working day before `now`, as a UTC instant. */
export function lastWorkingDayStart(now: Date): Date {
  const local = new Date(now.getTime() + TZ_OFFSET_MIN * 60_000)
  let d = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate())
  do {
    d -= 864e5
  } while ([0, 6].includes(new Date(d).getUTCDay()))
  return new Date(d - TZ_OFFSET_MIN * 60_000)
}

/** Whole working days (Mon–Fri) between two instants, in India time. */
export function workingDaysBetween(from: Date, to: Date): number {
  const day = (x: Date) => {
    const l = new Date(x.getTime() + TZ_OFFSET_MIN * 60_000)
    return Date.UTC(l.getUTCFullYear(), l.getUTCMonth(), l.getUTCDate())
  }
  let n = 0
  for (let d = day(from) + 864e5; d <= day(to); d += 864e5) if (![0, 6].includes(new Date(d).getUTCDay())) n++
  return n
}

const ticketHref = (key: string) => `/tickets/${encodeURIComponent(key)}`
const refHref = (kind: ActivityRow['kind'], ref: string) =>
  kind === 'ticket' || kind === 'comment' ? ticketHref(ref) : kind === 'task' ? '/plan' : `/cases/${encodeURIComponent(ref)}`

export function buildStandup(input: {
  now: Date
  people: StandupPerson[]
  activity: ActivityRow[]
  tickets: StandupTicket[]
  tasks: StandupTask[]
}): { since: Date; cards: StandupCard[]; unassigned: StandupItem[] } {
  const since = lastWorkingDayStart(input.now)
  const recent = input.activity.filter((a) => new Date(a.at) >= since)

  const cards = input.people.map((person): StandupCard => {
    const mine = input.tickets.filter((t) => t.owner_id === person.id)
    const yesterday = recent
      .filter((a) => a.actor_id === person.id)
      .sort((a, b) => b.at.localeCompare(a.at))
      .map((a) => ({ ref: a.ref, title: a.title, what: a.what, at: a.at, href: refHref(a.kind, a.ref) }))

    const today: StandupItem[] = []
    for (const t of mine.filter((t) => ['in_fix', 'triaged', 'new'].includes(t.state))) {
      today.push({ ref: t.key, title: t.title, note: t.state === 'in_fix' ? 'In fix' : t.state === 'triaged' ? 'Triaged, not started' : 'New', href: ticketHref(t.key) })
    }
    if (person.role !== 'dev') {
      const retests = input.tickets.filter((t) => t.state === 'ready_for_retest')
      if (retests.length) today.push({ ref: 'Retests', title: `${retests.length} tickets ready for retest`, note: 'QA queue', href: '/tickets' })
    }
    const late = (k: StandupTask) => k.status !== 'done' && new Date(`${k.due_on}T23:59:59+05:30`) < input.now
    const dueSoon = (k: StandupTask) => !late(k) && workingDaysBetween(input.now, new Date(`${k.due_on}T12:00:00Z`)) <= 2
    // Late tasks show under Blocked, not Today.
    for (const k of input.tasks.filter((k) => k.owner_id === person.id && !late(k) && (k.status === 'in_progress' || (k.status === 'not_started' && dueSoon(k))))) {
      today.push({ ref: `#${k.num}`, title: k.title, note: k.status === 'in_progress' ? `In progress · due ${k.due_on}` : `Due ${k.due_on}`, href: '/plan' })
    }

    const blocked: StandupItem[] = []
    for (const k of input.tasks.filter((k) => k.owner_id === person.id)) {
      if (k.status === 'blocked') blocked.push({ ref: `#${k.num}`, title: k.title, note: 'Marked blocked', href: '/plan', tone: 'crit' })
      else if (late(k))
        blocked.push({ ref: `#${k.num}`, title: k.title, note: `Late, was due ${k.due_on}`, href: '/plan', tone: 'warn' })
    }
    for (const t of mine) {
      if (t.state === 'reopened') blocked.push({ ref: t.key, title: t.title, note: 'Reopened after retest', href: ticketHref(t.key), tone: 'crit' })
      else if (['in_fix', 'triaged'].includes(t.state) && workingDaysBetween(new Date(t.updated_at), input.now) >= 2)
        blocked.push({ ref: t.key, title: t.title, note: `No movement for ${workingDaysBetween(new Date(t.updated_at), input.now)} working days`, href: ticketHref(t.key), tone: 'warn' })
    }
    return { person, yesterday, today, blocked }
  })

  const unassigned = input.tickets
    .filter((t) => !t.owner_id && !['closed', 'deferred', 'duplicate'].includes(t.state))
    .sort((a, b) => ['Critical', 'High', 'Medium', 'Low'].indexOf(a.severity) - ['Critical', 'High', 'Medium', 'Low'].indexOf(b.severity))
    .map((t) => ({ ref: t.key, title: t.title, note: t.severity, href: ticketHref(t.key), tone: (t.severity === 'Critical' ? 'crit' : t.severity === 'High' ? 'warn' : undefined) as StandupItem['tone'] }))

  return { since, cards, unassigned }
}
