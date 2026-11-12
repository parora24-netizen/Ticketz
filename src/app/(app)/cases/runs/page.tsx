import Link from 'next/link'
import { CASES_TABS, Tabs } from '@/components/tabs'
import { Chip, PageHeader } from '@/components/ui'
import { listRuns } from '@/lib/runs-server'
import { createClient } from '@/lib/supabase/server'
import { EXIT, hm, when } from '@/lib/runs-format'

/** Every run of the automated suite, newest first, with its pass rate and how it ended. */
export default async function RunsPage() {
  const supabase = await createClient()
  const runs = await listRuns(supabase, { limit: 100 })
  const full = runs.filter((r) => r.kind === 'full' && r.tests_done).slice(0, 20).reverse()
  const rate = (r: (typeof runs)[number]) => (r.tests_done ? Math.round(((r.passed ?? 0) / r.tests_done) * 100) : null)
  return (
    <>
      <Tabs items={CASES_TABS} active="runs" />
      <PageHeader sub="Each run of the automated suite: when it ran, how long, how it ended, and what passed. Open one for its phases, failures and waits." />
      {full.length > 1 && (
        <section className="card mb-4 px-4 py-3">
          <h2 className="text-[13px] font-semibold text-[var(--navy-ink)]">Pass rate, last {full.length} full runs</h2>
          <div className="mt-2 flex h-16 items-end gap-1" role="img" aria-label="Pass rate by run">
            {full.map((r) => <Link key={r.run_id} href={`/cases/runs/${encodeURIComponent(r.run_id)}`} title={`${when(r.started_at)}: ${rate(r)}%`} className="flex-1 bg-[#2b57c4] hover:bg-[var(--navy)]" style={{ height: `${Math.max(4, rate(r) ?? 0)}%` }} />)}
          </div>
        </section>
      )}
      <section className="card overflow-x-auto">
        <table className="table w-full text-[12.5px]">
          <thead><tr><th>Started</th><th>Run</th><th>Kind</th><th>How it ended</th><th className="text-right">Workers</th><th className="text-right">Wall time</th><th className="text-right">Tests</th><th className="text-right">Passed</th><th className="text-right">Failed</th><th className="text-right">Known defect</th><th className="text-right">Not tested</th><th className="text-right">Pass rate</th></tr></thead>
          <tbody>
            {runs.map((r) => {
              const running = r.recorded && !r.finished_at
              return (
                <tr key={r.run_id}>
                  <td className="mono whitespace-nowrap">{when(r.started_at)}</td>
                  <td><Link href={`/cases/runs/${encodeURIComponent(r.run_id)}`} className="mono font-medium text-[var(--accent)] hover:underline">{r.run_id}</Link>{r.confounded && <span className="ml-1.5"><Chip tone="warn">Bundle changed</Chip></span>}</td>
                  <td className="capitalize">{r.kind}</td>
                  <td>{running ? <Chip tone="accent">Running</Chip> : r.exit ? <Chip tone={EXIT[r.exit]?.tone ?? 'muted'}>{EXIT[r.exit]?.label ?? r.exit}</Chip> : '—'}{!r.recorded && <span className="ml-1.5 text-[11px] text-[var(--faint)]">results only</span>}</td>
                  <td className="text-right tabular-nums">{r.workers ?? '—'}</td>
                  <td className="text-right tabular-nums">{hm(r.wall_min ?? (r.finished_at && r.recorded ? (Date.parse(r.finished_at) - Date.parse(r.started_at)) / 60000 : null))}</td>
                  <td className="text-right tabular-nums">{r.tests_done ?? '—'}{r.tests_planned ? <span className="text-[var(--faint)]"> / {r.tests_planned}</span> : null}</td>
                  <td className="text-right tabular-nums">{r.passed ?? '—'}</td>
                  <td className={`text-right tabular-nums ${r.failed ? 'font-semibold text-[var(--crit)]' : ''}`}>{r.failed ?? '—'}</td>
                  <td className="text-right tabular-nums">{r.known_defect ?? '—'}</td>
                  <td className="text-right tabular-nums">{r.not_tested ?? '—'}</td>
                  <td className="text-right tabular-nums">{rate(r) == null ? '—' : `${rate(r)}%`}</td>
                </tr>
              )
            })}
            {!runs.length && <tr><td colSpan={12} className="text-[var(--muted)]">No runs yet.</td></tr>}
          </tbody>
        </table>
      </section>
    </>
  )
}
