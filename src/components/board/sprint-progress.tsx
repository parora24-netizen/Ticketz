import { FIX_STAGES, FIX_STAGE_LABEL } from '@/lib/workflow/board-moves'
import { STAGES, STAGE_LABEL, TEST_STAGES, TEST_STAGE_LABEL } from '@/lib/workflow/case-stage'

// One hue, light to dark as work moves along; red marks failures.
const FILL: Record<string, string> = {
  test: '#c3d0ee', fix: '#d03b3b', retest: '#6f8bd0', done: '#16327a',
  triage: '#c3d0ee', blocked: '#e7a33e', write: '#e3e9f6', automate: '#c3d0ee', auto: '#9db1e0', manual: '#6f8bd0', passed: '#16327a', failed: '#d03b3b',
}

/** Where the sprint's work is, as one bar in process order, with counts. Test sprints count areas still to write too. */
export function SprintProgress({ counts, mode = 'cases' }: { counts: Record<string, number>; mode?: 'cases' | 'test' | 'fix' }) {
  const cols: readonly string[] = mode === 'test' ? TEST_STAGES : mode === 'fix' ? FIX_STAGES : STAGES
  const label: Record<string, string> = mode === 'test' ? TEST_STAGE_LABEL : mode === 'fix' ? FIX_STAGE_LABEL : STAGE_LABEL
  const finished = mode === 'test' ? 'passed' : 'done'
  const total = cols.reduce((s, k) => s + (counts[k] ?? 0), 0) || 1
  const pct = Math.round(((counts[finished] ?? 0) / total) * 100)
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <h3 className="text-[13px] font-semibold text-[var(--navy-ink)]">Progress</h3>
        <span className="text-[12px] text-[var(--muted)]"><b className="text-[var(--ink)]">{pct}%</b> {label[finished].toLowerCase()} · {counts[finished] ?? 0} of {total}</span>
      </div>
      <div className="mt-2 flex h-4 gap-[2px]" role="img" aria-label={cols.map((s) => `${label[s]} ${counts[s] ?? 0}`).join(', ')}>
        {cols.map((s, i) => (counts[s] ?? 0) > 0 && (
          <div key={s} title={`${label[s]}: ${counts[s]}`} style={{ width: `${(counts[s] / total) * 100}%`, background: FILL[s] }}
            className={`${i === 0 ? 'rounded-l-[4px]' : ''} ${i === cols.length - 1 ? 'rounded-r-[4px]' : ''}`} />
        ))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-[var(--muted)]">
        {cols.map((s, i) => (
          <li key={s} className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5" style={{ background: FILL[s] }} />
            <span className="mono text-[10.5px] text-[var(--faint)]">{i + 1}</span>{label[s]} <b className="text-[var(--ink-2)]">{counts[s] ?? 0}</b>
          </li>
        ))}
      </ul>
    </div>
  )
}
