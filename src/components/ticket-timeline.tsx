import { FieldChanges, MARKERS, Timeline, type TimelineItem } from '@/components/timeline'
import { StateChip } from '@/components/ui'
import type { Field } from '@/lib/activity'
import type { TicketState } from '@/lib/workflow/ticket-machine'

export type TimelineEvent = { id: string; at: string; who: string | null; from_state: string | null; to_state: string | null; note: string | null }
export type TimelineComment = { id: string; at: string; who: string; body: string }
export type TimelineEdit = { id: string; at: string; who: string | null; fields: Field[] }

/** Owner notes from the database read "Owner: <name>" (or "Owner: none"). */
const ownerIn = (note: string | null) => (note?.startsWith('Owner: ') ? (note.slice(7) === 'none' ? null : note.slice(7)) : undefined)
const Who = ({ name }: { name: string }) => <b className="font-semibold text-[var(--ink)]">{name}</b>

/** Ticket events as timeline steps. `label` names the ticket when the timeline is not its own page. */
export function ticketEventItems(events: TimelineEvent[], label?: React.ReactNode): TimelineItem[] {
  // Owner changes are worded from the owner before, so walk events oldest first.
  const out: TimelineItem[] = []
  let owner: string | null = null
  const it = label ? <> {label}</> : ' it'
  for (const e of [...events].sort((a, b) => a.at.localeCompare(b.at))) {
    const who = <Who name={e.who ?? 'System'} />
    const o = ownerIn(e.note)
    if (!e.from_state) out.push({ id: e.id, at: e.at, marker: MARKERS.opened, body: <p>{who} opened {label ?? 'the ticket'}</p> })
    else if (e.from_state !== e.to_state) out.push({ id: e.id, at: e.at, marker: MARKERS.move, body: (
      <>
        <p className="flex flex-wrap items-center gap-1.5">{who} moved{it} <StateChip s={e.from_state as TicketState} /> <span className="text-[var(--faint)]">→</span> <StateChip s={e.to_state as TicketState} /></p>
        {e.note && <p className="mt-1 text-[12.5px] text-[var(--muted)]">{e.note}</p>}
      </>
    ) })
    else if (o !== undefined) {
      const was = owner
      out.push({ id: e.id, at: e.at, marker: MARKERS.owner, body: (
        <p>
          {o === null
            ? <>{who} unassigned{it}{was && <span className="text-[var(--muted)]"> (was {was})</span>}</>
            : o === e.who
            ? <>{who} took{it}{was && <span className="text-[var(--muted)]"> from {was}</span>}</>
            : <>{who} assigned{it} to <b className="font-semibold">{o}</b>{was && <span className="text-[var(--muted)]"> (was {was})</span>}</>}
        </p>
      ) })
      owner = o
    } else if (e.note) out.push({ id: e.id, at: e.at, marker: MARKERS.note, body: <p>{who}: {e.note}</p> })
  }
  return out
}

export function editItems(edits: TimelineEdit[], noun = ''): TimelineItem[] {
  return edits.filter((x) => x.fields.length).map((x) => ({
    id: x.id, at: x.at, marker: MARKERS.edit, body: (
      <>
        <p><Who name={x.who ?? 'System'} /> edited {noun}{x.fields.map((f) => f.field.toLowerCase()).join(', ')}</p>
        <FieldChanges fields={x.fields} />
      </>
    ),
  }))
}

/** A ticket's history as a vertical timeline, newest first, with a label for each day. */
export function TicketTimeline({ events, comments, edits = [] }: { events: TimelineEvent[]; comments: TimelineComment[]; edits?: TimelineEdit[] }) {
  const items: TimelineItem[] = [
    ...ticketEventItems(events),
    ...comments.map((c) => ({ id: c.id, at: c.at, marker: MARKERS.comment, body: (
      <>
        <p><Who name={c.who} /> commented</p>
        <p className="mt-1.5 whitespace-pre-wrap border border-[var(--line-soft)] bg-[var(--surface-3)] px-3 py-2 text-[13px]">{c.body}</p>
      </>
    ) })),
    ...editItems(edits),
  ]
  return <Timeline items={items} />
}
