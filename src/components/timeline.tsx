/** A vertical history: a marker per step on one line, grouped under day labels, newest first. */
export type TimelineItem = { id: string; at: string; marker: Marker; body: React.ReactNode }
export type Marker = { cls: string; glyph: string }

export const MARKERS = {
  opened: { cls: 'bg-[var(--navy)] text-white', glyph: '+' },
  move: { cls: 'bg-[var(--accent)] text-white', glyph: '→' },
  owner: { cls: 'bg-white text-[var(--navy-ink)] border border-[var(--navy)]', glyph: '@' },
  comment: { cls: 'bg-white text-[var(--ink-2)] border border-[var(--line)]', glyph: '“' },
  edit: { cls: 'bg-[var(--accent-soft)] text-[var(--accent)] border border-[var(--accent-line)]', glyph: '✎' },
  note: { cls: 'bg-[var(--surface-2)] text-[var(--muted)]', glyph: '•' },
  passed: { cls: 'bg-[var(--good)] text-white', glyph: '✓' },
  failed: { cls: 'bg-[var(--crit)] text-white', glyph: '✕' },
  other: { cls: 'bg-[var(--warn-soft)] text-[var(--warn)] border border-[var(--warn-line)]', glyph: '!' },
} satisfies Record<string, Marker>

const IST = 'Asia/Kolkata'
const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: IST })
const time = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: IST })

export function Timeline({ items, empty = 'Nothing yet.' }: { items: TimelineItem[]; empty?: string }) {
  const list = [...items].sort((a, b) => b.at.localeCompare(a.at))
  let lastDay = ''
  return (
    <ol className="relative mt-5 ml-3 border-l-2 border-[var(--line)]">
      {list.map((item) => {
        const d = day(item.at)
        const newDay = d !== lastDay
        lastDay = d
        return (
          <li key={item.id} className="relative pb-4 pl-6 last:pb-0">
            {newDay && <div className="mb-2 text-[11px] font-semibold tracking-wide text-[var(--muted)] uppercase">{d}</div>}
            <span aria-hidden className={`absolute -left-[13px] flex h-6 w-6 items-center justify-center rounded-full text-[12px] leading-none font-semibold ${newDay ? 'top-7' : 'top-0'} ${item.marker.cls}`}>{item.marker.glyph}</span>
            <div className="flex items-baseline justify-between gap-3 text-[13px] text-[var(--ink-2)]">
              <div className="min-w-0">{item.body}</div>
              <span className="mono shrink-0 text-[11px] text-[var(--faint)]">{time(item.at)}</span>
            </div>
          </li>
        )
      })}
      {!list.length && <li className="pl-6 text-[13px] text-[var(--muted)]">{empty}</li>}
    </ol>
  )
}

/** Field edits from the change log: "Field: before → after", long values cut short. */
export function FieldChanges({ fields }: { fields: { field: string; before: string; after: string }[] }) {
  const cut = (s: string) => (s.length > 120 ? `${s.slice(0, 120)}…` : s)
  return (
    <ul className="mt-1 space-y-0.5 text-[12px]">
      {fields.map((f) => (
        <li key={f.field}>
          <span className="text-[var(--muted)]">{f.field}: </span>
          <span className="text-[var(--muted)] line-through decoration-[var(--faint)]" title={f.before}>{cut(f.before)}</span>
          <span className="text-[var(--faint)]"> → </span>
          <span title={f.after}>{cut(f.after)}</span>
        </li>
      ))}
    </ul>
  )
}
