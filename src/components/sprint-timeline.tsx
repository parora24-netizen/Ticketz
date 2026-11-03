import Link from 'next/link'
import { fmtDate, type Sprint } from '@/lib/data'
import { sprintHref } from '@/lib/links'

/** The sprints laid out by calendar day up to the release, with today and go/no-go marked. */
export function SprintTimeline({ sprints, today, releaseOn, goNoGoOn }: { sprints: Sprint[]; today: string; releaseOn: string; goNoGoOn?: string }) {
  const first = [sprints[0]?.starts_on ?? today, today].sort()[0]
  const span = Math.max(1, (Date.parse(releaseOn) - Date.parse(first)) / 864e5 + 1)
  const pos = (d: string) => ((Date.parse(d) - Date.parse(first)) / 864e5 / span) * 100
  return (
    <div>
      <div className="relative h-14">
        {sprints.map((s) => (
          <Link key={s.id} href={sprintHref(s)} title={`${s.name}: ${fmtDate(s.starts_on)} to ${fmtDate(s.ends_on)}${s.goal ? ` · ${s.goal}` : ''}`}
            className={`absolute top-0 flex h-8 items-center justify-center border text-[11px] font-semibold ${
              s.status === 'closed' ? 'border-[var(--navy)] bg-[var(--navy)] text-white'
              : s.status === 'active' ? 'border-[var(--navy)] bg-[var(--accent-soft)] text-[var(--navy)]'
              : 'border-[var(--line)] bg-[var(--surface-2)] text-[var(--ink-2)]'}`}
            style={{ left: `${pos(s.starts_on)}%`, width: `calc(${pos(s.ends_on) - pos(s.starts_on) + 100 / span}% - 2px)` }}>
            {s.name}
          </Link>
        ))}
        <div className="absolute top-0 h-11 w-0.5 bg-[#d03b3b]" style={{ left: `${Math.min(100, Math.max(0, pos(today)))}%` }} title={`Today, ${fmtDate(today)}`} />
        {goNoGoOn && <div className="absolute top-0 h-11 w-0.5 bg-[var(--warn)]" style={{ left: `${Math.min(100, pos(goNoGoOn))}%` }} title={`Go/no-go, ${fmtDate(goNoGoOn)}`} />}
        <div className="absolute top-0 h-11 w-0.5 bg-[var(--navy-ink)]" style={{ left: 'calc(100% - 2px)' }} title={`Release, ${fmtDate(releaseOn)}`} />
        <div className="mono absolute top-9 left-0 text-[10.5px] text-[var(--faint)]">{fmtDate(first)}</div>
        <div className="mono absolute top-9 right-0 text-[10.5px] text-[var(--faint)]">Release {fmtDate(releaseOn)}</div>
      </div>
      <p className="mt-1 text-[11.5px] text-[var(--muted)]">
        <span className="inline-block h-2.5 w-0.5 bg-[#d03b3b] align-middle" /> today
        {goNoGoOn && <> · <span className="inline-block h-2.5 w-0.5 bg-[var(--warn)] align-middle" /> go/no-go {fmtDate(goNoGoOn)}</>}
        {' '}· dark = closed · outlined = running · grey = planned
      </p>
    </div>
  )
}
