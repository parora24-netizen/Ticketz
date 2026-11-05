'use client'

import type { ChartData } from '@/components/grid/grid-charts'
import { Bar } from '@/components/ui'
import { pct } from '@/lib/progress'

export type Tone = 'good' | 'warn' | 'crit' | 'accent' | 'muted'
const DOT: Record<Tone, string> = { good: 'bg-[var(--good)]', warn: 'bg-[var(--warn)]', crit: 'bg-[var(--crit)]', accent: 'bg-[var(--accent)]', muted: 'bg-[var(--line)]' }

/** The tone a status value is drawn in, on the cards and the grid's chips. */
export const STATUS_TONE: Record<string, Tone> = {
  Completed: 'good', 'Fully automated': 'good', Done: 'good', Passing: 'good', 'None open': 'good',
  Writing: 'accent', Partly: 'accent', 'In progress': 'accent', Testing: 'accent',
  Late: 'crit', 'Critical/High open': 'crit', 'Critical open': 'crit',
  'Failures open': 'warn', 'High open': 'warn', 'Others open': 'accent',
}

/**
 * A headline card above a grid whose parts filter it: the bar and one button per value of the
 * grid column `chart` counts (clicking one shows only those rows; again clears it).
 */
export function FilterCard({ label, value, unit, line, chart, toggle }: {
  label: string; value: string; unit: React.ReactNode; line: React.ReactNode; chart: ChartData; toggle: (key: string, value: string) => void
}) {
  const parts = chart.bars.map((b) => ({ value: b.count, tone: STATUS_TONE[b.label] ?? 'muted', label: b.label }))
  return (
    <div className="card px-4 py-3">
      <div className="label">{label}</div>
      <div className="mt-1.5 flex items-baseline gap-2">
        <span className="heading text-[26px] leading-none font-semibold text-[var(--navy-ink)] tabular-nums">{value}</span>
        <span className="text-[12.5px] text-[var(--muted)]">{unit}</span>
      </div>
      <div className="mt-2.5"><Bar parts={parts} /></div>
      <div className="mt-2 flex flex-wrap gap-1">
        {chart.bars.map((b) => {
          const on = chart.selected.includes(b.label)
          return (
            <button key={b.label} type="button" onClick={() => toggle(chart.spec.key, b.label)} aria-pressed={on}
              title={`Show only: ${b.label}. Click again to clear.`}
              className={`inline-flex h-6 items-center gap-1.5 border px-2 text-[11.5px] ${on ? 'border-[var(--navy)] bg-[var(--accent-soft)] font-semibold text-[var(--navy)]' : 'border-[var(--line)] bg-white text-[var(--ink-2)] hover:border-[var(--navy)]'}`}>
              <span className={`size-2 ${DOT[STATUS_TONE[b.label] ?? 'muted']}`} />
              {b.label} <span className="tabular-nums text-[var(--muted)]">{b.count}</span>
            </button>
          )
        })}
      </div>
      <p className="mt-2 text-[12px] text-[var(--muted)]">{line}</p>
    </div>
  )
}

/** "n of m · x%" over a small stacked bar, for a grid cell. */
export function MiniBar({ n, of, parts }: { n: number; of: number; parts: { value: number; tone: Tone; label: string }[] }) {
  return (
    <div>
      <div className="text-[11px] text-[var(--muted)] tabular-nums">{n} of {of} · {pct(n, of)}%</div>
      <div className="mt-1"><Bar parts={parts} /></div>
    </div>
  )
}
