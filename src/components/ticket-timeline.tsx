import { StateChip } from '@/components/ui'
import type { Field } from '@/lib/activity'
import type { TicketState } from '@/lib/workflow/ticket-machine'

export type TimelineEvent = { id: string; at: string; who: string | null; from_state: string | null; to_state: string | null; note: string | null }
export type TimelineComment = { id: string; at: string; who: string; body: string }
export type TimelineEdit = { id: string; at: string; who: string | null; fields: Field[] }

type Item =
  | { kind: 'opened'; id: string; at: string; who: string }
  | { kind: 'state'; id: string; at: string; who: string; from: TicketState; to: TicketState; note: string | null }
  | { kind: 'owner'; id: string; at: string; who: string; owner: string | null; was: string | null }
  | { kind: 'comment'; id: string; at: string; who: string; body: string }
  | { kind: 'edit'; id: string; at: string; who: string; fields: Field[] }
  | { kind: 'note'; id: string; at: string; who: string; text: string }

const IST = 'Asia/Kolkata'
const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: IST })
const time = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: IST })

/** Marker colour and glyph per kind of step. */
const DOT: Record<Item['kind'], { cls: string; glyph: string }> = {
  opened: { cls: 'bg-[var(--navy)] text-white', glyph: '+' },
  state: { cls: 'bg-[var(--accent)] text-white', glyph: '→' },
  owner: { cls: 'bg-white text-[var(--navy-ink)] border border-[var(--navy)]', glyph: '@' },
  comment: { cls: 'bg-white text-[var(--ink-2)] border border-[var(--line)]', glyph: '“' },
  edit: { cls: 'bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent-line)]', glyph: '✎' },
  note: { cls: 'bg-[var(--surface-2)] text-[var(--muted)]', glyph: '•' },
}

/** Owner notes from the database read "Owner: <name>" (or "Owner: none"). */
const ownerIn = (note: string | null) => (note?.startsWith('Owner: ') ? (note.slice(7) === 'none' ? null : note.slice(7)) : undefined)

function items(events: TimelineEvent[], comments: TimelineComment[], edits: TimelineEdit[]): Item[] {
  // Owner changes are worded from the owner before, so walk events oldest first.
  const out: Item[] = []
  let owner: string | null = null
  for (const e of [...events].sort((a, b) => a.at.localeCompare(b.at))) {
    const who = e.who ?? 'System'
    const o = ownerIn(e.note)
    if (!e.from_state) out.push({ kind: 'opened', id: e.id, at: e.at, who })
    else if (e.from_state !== e.to_state) out.push({ kind: 'state', id: e.id, at: e.at, who, from: e.from_state as TicketState, to: e.to_state as TicketState, note: e.note })
    else if (o !== undefined) { out.push({ kind: 'owner', id: e.id, at: e.at, who, owner: o, was: owner }); owner = o }
    else if (e.note) out.push({ kind: 'note', id: e.id, at: e.at, who, text: e.note })
  }
  for (const c of comments) out.push({ kind: 'comment', id: c.id, at: c.at, who: c.who, body: c.body })
  for (const x of edits) if (x.fields.length) out.push({ kind: 'edit', id: x.id, at: x.at, who: x.who ?? 'System', fields: x.fields })
  return out.sort((a, b) => b.at.localeCompare(a.at))
}

function Line({ item }: { item: Item }) {
  const who = <b className="font-semibold text-[var(--ink)]">{item.who}</b>
  switch (item.kind) {
    case 'opened': return <p>{who} opened the ticket</p>
    case 'state': return (
      <>
        <p className="flex flex-wrap items-center gap-1.5">{who} moved it <StateChip s={item.from} /> <span className="text-[var(--faint)]">→</span> <StateChip s={item.to} /></p>
        {item.note && <p className="mt-1 text-[12.5px] text-[var(--muted)]">{item.note}</p>}
      </>
    )
    case 'owner': return (
      <p>
        {item.owner === null
          ? <>{who} unassigned it{item.was && <span className="text-[var(--muted)]"> (was {item.was})</span>}</>
          : item.owner === item.who
          ? <>{who} took it{item.was && <span className="text-[var(--muted)]"> from {item.was}</span>}</>
          : <>{who} assigned it to <b className="font-semibold">{item.owner}</b>{item.was && <span className="text-[var(--muted)]"> (was {item.was})</span>}</>}
      </p>
    )
    case 'comment': return (
      <>
        <p>{who} commented</p>
        <p className="mt-1.5 whitespace-pre-wrap border border-[var(--line-soft)] bg-[var(--surface-3)] px-3 py-2 text-[13px]">{item.body}</p>
      </>
    )
    case 'edit': return (
      <>
        <p>{who} edited {item.fields.map((f) => f.field.toLowerCase()).join(', ')}</p>
        <ul className="mt-1 space-y-0.5 text-[12px]">
          {item.fields.map((f) => (
            <li key={f.field}>
              <span className="text-[var(--muted)]">{f.field}: </span>
              <span className="text-[var(--muted)] line-through decoration-[var(--faint)]">{f.before.length > 120 ? `${f.before.slice(0, 120)}…` : f.before}</span>
              <span className="text-[var(--faint)]"> → </span>
              <span>{f.after.length > 120 ? `${f.after.slice(0, 120)}…` : f.after}</span>
            </li>
          ))}
        </ul>
      </>
    )
    case 'note': return <p>{who}: {item.text}</p>
  }
}

/** A ticket's history as a vertical timeline, newest first, with a label for each day. */
export function TicketTimeline({ events, comments, edits = [] }: { events: TimelineEvent[]; comments: TimelineComment[]; edits?: TimelineEdit[] }) {
  const list = items(events, comments, edits)
  let lastDay = ''
  return (
    <ol className="relative mt-5 ml-3 border-l-2 border-[var(--line)]">
      {list.map((item) => {
        const d = day(item.at)
        const newDay = d !== lastDay
        lastDay = d
        return (
          <li key={item.id} className="relative pb-4 pl-6 last:pb-0">
            {newDay && <div className="-ml-6 mb-2 pl-6 text-[11px] font-semibold tracking-wide text-[var(--muted)] uppercase">{d}</div>}
            <span aria-hidden className={`absolute -left-[13px] flex h-6 w-6 items-center justify-center rounded-full text-[12px] leading-none font-semibold ${newDay ? 'top-7' : 'top-0'} ${DOT[item.kind].cls}`}>{DOT[item.kind].glyph}</span>
            <div className="text-[13px] text-[var(--ink-2)]">
              <div className="flex items-baseline justify-between gap-3">
                <div className="min-w-0"><Line item={item} /></div>
                <span className="mono shrink-0 text-[11px] text-[var(--faint)]">{time(item.at)}</span>
              </div>
            </div>
          </li>
        )
      })}
      {!list.length && <li className="pl-6 text-[13px] text-[var(--muted)]">Nothing yet.</li>}
    </ol>
  )
}
