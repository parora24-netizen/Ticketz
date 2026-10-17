import type { Stage } from '@/lib/workflow/case-stage'
import { STAGES, STAGE_LABEL } from '@/lib/workflow/case-stage'

// One hue, light to dark as cases move along; Fix is red because those cases failed.
const FILL: Record<Stage, string> = {
  automate: '#dfe6f5', auto_run: '#b9c8ea', manual: '#8aa3dc', fix: '#d03b3b', retest: '#4f6fbf', done: '#16327a',
}

/** Where the sprint's cases are, as one bar in process order, with counts. */
export function SprintProgress({ counts }: { counts: Record<Stage, number> }) {
  const total = STAGES.reduce((s, k) => s + counts[k], 0) || 1
  const pct = Math.round((counts.done / total) * 100)
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <h3 className="text-[13px] font-semibold text-[var(--navy-ink)]">Progress</h3>
        <span className="text-[12px] text-[var(--muted)]"><b className="text-[var(--ink)]">{pct}%</b> closed · {counts.done} of {total}</span>
      </div>
      <div className="mt-2 flex h-4 gap-[2px]" role="img" aria-label={STAGES.map((s) => `${STAGE_LABEL[s]} ${counts[s]}`).join(', ')}>
        {STAGES.map((s, i) => counts[s] > 0 && (
          <div key={s} title={`${STAGE_LABEL[s]}: ${counts[s]}`} style={{ width: `${(counts[s] / total) * 100}%`, background: FILL[s] }}
            className={`${i === 0 ? 'rounded-l-[4px]' : ''} ${i === STAGES.length - 1 ? 'rounded-r-[4px]' : ''}`} />
        ))}
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11.5px] text-[var(--muted)]">
        {STAGES.map((s, i) => (
          <li key={s} className="flex items-center gap-1.5">
            <span className="inline-block h-2.5 w-2.5" style={{ background: FILL[s] }} />
            <span className="mono text-[10.5px] text-[var(--faint)]">{i + 1}</span>{STAGE_LABEL[s]} <b className="text-[var(--ink-2)]">{counts[s]}</b>
          </li>
        ))}
      </ul>
    </div>
  )
}
