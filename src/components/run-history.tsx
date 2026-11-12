import Link from 'next/link'
import { secs, when } from '@/lib/runs-format'

type Point = { run_id: string | null; result: string; duration_ms: number | null; recorded_at: string; error_head: string | null; note: string | null }
const DOT: Record<string, string> = { passed: '#2b57c4', failed: '#d03b3b', known_defect: '#d08a1f', skipped: '#9aa3b2' }

/** A case's automated result and duration in each run: a slowing or flaky test shows as a line. */
export function RunHistory({ points }: { points: Point[] }) {
  if (!points.length) return <p className="px-4 py-3 text-[12.5px] text-[var(--muted)]">No automated results yet.</p>
  const W = 640, H = 90, P = 6
  const max = Math.max(1, ...points.map((p) => p.duration_ms ?? 0))
  const x = (i: number) => P + (points.length === 1 ? (W - 2 * P) / 2 : (i * (W - 2 * P)) / (points.length - 1))
  const y = (ms: number | null) => H - P - ((ms ?? 0) / max) * (H - 2 * P)
  const line = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.duration_ms).toFixed(1)}`).join(' ')
  return (
    <div className="px-4 py-3">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-24 w-full" role="img" aria-label="Duration and result per run">
        <path d={line} fill="none" stroke="#c7ccd6" strokeWidth="1.5" />
        {points.map((p, i) => <circle key={i} cx={x(i)} cy={y(p.duration_ms)} r="3.5" fill={DOT[p.result] ?? '#9aa3b2'}><title>{`${when(p.recorded_at)} · ${p.result} · ${secs(p.duration_ms)}${p.run_id ? ` · ${p.run_id}` : ''}`}</title></circle>)}
      </svg>
      <p className="mt-1 text-[11.5px] text-[var(--muted)]">Duration per run (worst {secs(max)}); dot colour is the result: <span style={{ color: DOT.passed }}>passed</span>, <span style={{ color: DOT.failed }}>failed</span>, <span style={{ color: DOT.known_defect }}>known defect</span>, <span style={{ color: DOT.skipped }}>not tested</span>.</p>
      <ul className="mt-2 max-h-48 divide-y divide-[var(--row)] overflow-y-auto text-[12px]">
        {[...points].reverse().slice(0, 15).map((p, i) => (
          <li key={i} className="flex gap-2 py-1">
            <span className="mono w-28 shrink-0 text-[var(--muted)]">{when(p.recorded_at)}</span>
            <span className="w-24 shrink-0" style={{ color: DOT[p.result] }}>{p.result.replace('_', ' ')}</span>
            <span className="w-16 shrink-0 text-right tabular-nums">{secs(p.duration_ms)}</span>
            {p.run_id ? <Link href={`/cases/runs/${encodeURIComponent(p.run_id)}`} className="mono truncate text-[var(--accent)] hover:underline">{p.run_id}</Link> : null}
          </li>
        ))}
      </ul>
    </div>
  )
}
