'use client'

/** One small bar chart per dimension above a grid. Clicking a bar filters the grid by that value. */
export type ChartSpec = { key: string; title: string; top?: number; order?: string[] }
export type ChartData = { spec: ChartSpec; bars: { label: string; count: number }[]; total: number; selected: string[] }

export function GridCharts({ charts, onToggle }: { charts: ChartData[]; onToggle: (key: string, value: string) => void }) {
  return (
    <div className="mb-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {charts.map(({ spec, bars, total, selected }) => {
        const max = Math.max(1, ...bars.map((b) => b.count))
        const filtering = selected.length > 0
        return (
          <section key={spec.key} className="border border-[var(--line)] bg-white px-3 pt-2.5 pb-2">
            <header className="mb-1.5 flex items-baseline justify-between">
              <h3 className="text-[12.5px] font-semibold text-[var(--navy-ink)]">{spec.title}</h3>
              <span className="mono text-[10.5px] text-[var(--faint)]">{filtering ? 'click again to clear' : `${total} rows`}</span>
            </header>
            <ul className="space-y-0.5">
              {bars.map((b) => {
                const on = selected.includes(b.label)
                const pct = total ? Math.round((b.count / total) * 100) : 0
                return (
                  <li key={b.label}>
                    <button type="button" onClick={() => onToggle(spec.key, b.label)}
                      title={`${spec.title}: ${b.label} · ${b.count} (${pct}%). Click to ${on ? 'remove from' : 'add to'} the filter.`}
                      aria-pressed={on}
                      className="group grid w-full grid-cols-[minmax(0,7.5rem)_1fr_2.5rem] items-center gap-2 py-[3px] text-left hover:bg-[var(--surface-3)]">
                      <span className={`truncate text-[11.5px] ${on ? 'font-semibold text-[var(--navy-ink)]' : 'text-[var(--ink-2)]'}`}>{b.label}</span>
                      <span className="h-3 bg-[var(--surface-2)]">
                        <span className={`block h-3 rounded-r-[4px] transition-colors ${
                          on ? 'bg-[var(--navy)]' : filtering ? 'bg-[#c3cee2]' : 'bg-[#5b77b8] group-hover:bg-[var(--navy)]'}`}
                          style={{ width: `${Math.max(2, (b.count / max) * 100)}%` }} />
                      </span>
                      <span className="mono text-right text-[11px] text-[var(--ink-2)] tabular-nums">{b.count}</span>
                    </button>
                  </li>
                )
              })}
              {bars.length === 0 && <li className="py-2 text-[11.5px] text-[var(--faint)]">No rows</li>}
            </ul>
          </section>
        )
      })}
    </div>
  )
}
