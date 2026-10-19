import type { Release, ScheduleChange } from '@/lib/data'

const KIND: Record<string, string> = {
  extend_sprint: 'Extended', shift_release: 'Release moved', spill_over: 'Spillover', move_tickets: 'Tickets moved', close_sprint: 'Closed',
}
const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })
const day = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })

/** Every change to the schedule: who, what and why, newest first. */
export function ScheduleLog({ changes, release, limit }: { changes: ScheduleChange[]; release: Release; limit?: number }) {
  const slip = Math.round((Date.parse(release.release_on) - Date.parse(release.original_release_on)) / 864e5)
  const list = limit ? changes.slice(0, limit) : changes
  return (
    <section id="schedule" className="card mt-4 scroll-mt-20">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[var(--line)] px-4 py-2.5">
        <h3 className="text-[14px] font-semibold text-[var(--navy-ink)]">Schedule log</h3>
        <span className="text-[12px] text-[var(--muted)]">
          Release {day(release.release_on)}
          {slip !== 0 && <b className={slip > 0 ? 'ml-1 text-[var(--crit)]' : 'ml-1 text-[var(--good)]'}>({slip > 0 ? `+${slip}` : slip} days from the original {day(release.original_release_on)})</b>}
        </span>
      </header>
      {list.length === 0
        ? <p className="px-4 py-4 text-[12.5px] text-[var(--muted)]">No changes yet.</p>
        : (
          <ul className="divide-y divide-[var(--row)]">
            {list.map((c) => (
              <li key={c.id} className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-3 px-4 py-2.5 text-[12.5px] sm:grid-cols-[7.5rem_7rem_minmax(0,1fr)]">
                <span className="mono text-[11.5px] text-[var(--muted)]">{when(c.at)}</span>
                <span className="hidden font-semibold text-[var(--ink-2)] sm:inline">{KIND[c.kind] ?? c.kind}</span>
                <span>
                  {c.summary}
                  <span className="block text-[11.5px] text-[var(--muted)]">{c.actor ?? 'Someone'}{c.reason ? `: ${c.reason}` : ''}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
    </section>
  )
}
