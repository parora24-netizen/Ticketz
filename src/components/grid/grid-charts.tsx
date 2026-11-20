'use client'

import { useState } from 'react'

/**
 * One small bar chart per dimension above a grid. Clicking a bar filters the grid by that value.
 * Past `top` bars the rest fold into "Other (n)"; clicking it lists them all in a scrolling box.
 */
export type ChartSpec = { key: string; title: string; top?: number; order?: string[] }
export type ChartData = { spec: ChartSpec; bars: { label: string; count: number }[]; total: number; selected: string[] }

// Static class names, so Tailwind keeps them.
const XL_COLS: Record<number, string> = { 1: 'xl:grid-cols-1', 2: 'xl:grid-cols-2', 3: 'xl:grid-cols-3', 4: 'xl:grid-cols-4', 5: 'xl:grid-cols-5', 6: 'xl:grid-cols-3', 7: 'xl:grid-cols-4', 8: 'xl:grid-cols-4' }

/**
 * `compact`: one row of charts (scrolling sideways if they don't fit) with fewer bars each, for a
 * grid that fills the page, so the rows keep most of the height.
 */
export function GridCharts({ charts, onToggle, compact = false }: { charts: ChartData[]; onToggle: (key: string, value: string) => void; compact?: boolean }) {
  const [opened, setOpened] = useState<Set<string>>(new Set())
  const flip = (key: string) => setOpened((s) => { const n = new Set(s); if (n.has(key)) n.delete(key); else n.add(key); return n })
  return (
    <div className={compact
      ? 'mb-3 grid shrink-0 auto-cols-[minmax(190px,1fr)] grid-flow-col items-start gap-2 overflow-x-auto'
      : `mb-3 grid grid-cols-1 items-start gap-3 sm:grid-cols-2 ${XL_COLS[Math.min(charts.length, 8)] ?? 'xl:grid-cols-4'}`}>
      {charts.map(({ spec, bars: all, total, selected }) => {
        const top = spec.top ?? (compact ? 6 : 8)
        const open = opened.has(spec.key)
        const folds = all.length > top
        // Folded: the first top-1 values, then the rest as one bar (a selected value stays in view).
        const bars = !folds || open ? all : [
          ...all.slice(0, top - 1),
          ...all.slice(top - 1).filter((b) => selected.includes(b.label)),
          { label: `Other (${all.length - top + 1})`, count: all.slice(top - 1).reduce((n, b) => n + b.count, 0), other: true },
        ]
        const max = Math.max(1, ...bars.filter((b) => !('other' in b)).map((b) => b.count))
        const filtering = selected.length > 0
        return (
          <section key={spec.key} className="border border-[var(--line)] bg-white px-3 pt-2.5 pb-2">
            <header className="mb-1.5 flex items-baseline justify-between">
              <h3 className="text-[12.5px] font-semibold text-[var(--navy-ink)]">{spec.title}</h3>
              <span className="mono text-[10.5px] text-[var(--faint)]">{filtering ? 'click again to clear' : `${total} rows`}</span>
            </header>
            <ul className={`space-y-0.5 ${open ? 'max-h-60 overflow-y-auto pr-1' : ''}`}>
              {bars.map((b) => {
                const other = 'other' in b
                const on = !other && selected.includes(b.label)
                const pct = total ? Math.round((b.count / total) * 100) : 0
                return (
                  <li key={b.label}>
                    <button type="button" onClick={() => (other ? flip(spec.key) : onToggle(spec.key, b.label))}
                      title={other ? `Show all ${all.length} in a list you can scroll` : `${spec.title}: ${b.label} · ${b.count} (${pct}%). Click to ${on ? 'remove from' : 'add to'} the filter.`}
                      aria-pressed={other ? undefined : on} aria-expanded={other ? false : undefined}
                      className={`group grid w-full ${compact ? 'grid-cols-[minmax(0,6.5rem)_1fr_2rem] gap-1.5' : 'grid-cols-[minmax(0,7.5rem)_1fr_2.5rem] gap-2'} items-center py-[3px] text-left hover:bg-[var(--surface-3)]`}>
                      <span className={`truncate text-[11.5px] ${on ? 'font-semibold text-[var(--navy-ink)]' : 'text-[var(--ink-2)]'}`}>{b.label}</span>
                      <span className="h-3 bg-[var(--surface-2)]">
                        <span className={`block h-3 rounded-r-[4px] transition-colors ${
                          on ? 'bg-[var(--navy)]' : filtering ? 'bg-[#c3cee2]' : 'bg-[#5b77b8] group-hover:bg-[var(--navy)]'}`}
                          style={{ width: `${Math.max(2, Math.min(100, (b.count / max) * 100))}%` }} />
                      </span>
                      <span className="mono text-right text-[11px] text-[var(--ink-2)] tabular-nums">{b.count}</span>
                    </button>
                  </li>
                )
              })}
              {bars.length === 0 && <li className="py-2 text-[11.5px] text-[var(--faint)]">No rows</li>}
            </ul>
            {folds && open && (
              <button type="button" onClick={() => flip(spec.key)} aria-expanded="true"
                className="mt-1 text-[11.5px] text-[var(--accent)] hover:underline">Show top {top - 1} only</button>
            )}
          </section>
        )
      })}
    </div>
  )
}
