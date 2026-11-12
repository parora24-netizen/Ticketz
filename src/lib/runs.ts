import { z } from 'zod'

/**
 * Suite runs as something to drill into. Payloads the runner posts, and the pure analysis behind a
 * run's page: counts by page, failures, not-tested reasons, the slowest tests, waits by site, and
 * what changed against the previous full run.
 */
const iso = z.iso.datetime({ offset: true })
const text = (max: number) => z.string().trim().max(max)
const count = z.number().int().min(0).max(1_000_000)
const minutes = z.number().min(0).max(100_000)

export const RunStart = z.strictObject({
  run_id: z.string().trim().min(1).max(200),
  kind: z.enum(['full', 'batch', 'probe']).default('full'),
  target: text(100).optional(), branch: text(200).optional(), commit: text(100).optional(),
  bundle: text(200).optional(), workers: count.optional(), tests_planned: count.optional(),
  launcher: text(200).optional(), started_at: iso.optional(), eta: iso.optional(),
})

export const RunUpdate = z.strictObject({
  tests_done: count.optional(), passed: count.optional(), failed: count.optional(), known_defect: count.optional(), not_tested: count.optional(),
  tests_planned: count.optional(), workers: count.optional(), eta: iso.nullable().optional(),
  finished_at: iso.optional(), exit: z.enum(['finished', 'killed', 'gave_up', 'refused']).optional(),
  bundle_end: text(200).optional(), confounded: z.boolean().optional(), wall_min: minutes.optional(), worker_min: minutes.optional(),
  creates_failed: count.optional(), rate_limit_waits: count.optional(), http_503: count.optional(), lock_wait_min: minutes.optional(),
}).refine((p) => Object.keys(p).length > 0, { message: 'Send at least one field' })

export const PHASES = ['sweep', 'gate_signin', 'gate_create', 'pool_reset', 'pool_build', 'warmup', 'run', 'lane_094', 'reports', 'publish', 'post'] as const
export const RunPhase = z.strictObject({
  phase: z.string().trim().min(1).max(60), at: iso, duration_s: z.number().min(0).max(1_000_000).optional(),
  outcome: z.enum(['ok', 'failed', 'cut', 'skipped']), detail: text(2000).optional(),
})

export const WAIT_SITES = ['landing_settle', 'engine_open', 'toast', 'create', 'sign_in', 'connection_check', 'pool_claim'] as const
export const RunWaits = z.array(z.strictObject({
  tc_id: z.string().trim().min(1).max(40).optional(), site: z.string().trim().min(1).max(60),
  ms: z.number().int().min(0).max(86_400_000), outcome: text(30).optional(),
})).min(1).max(5000)

/** Telemetry a result may carry besides tc_id, status and duration. */
export const ResultTelemetry = z.object({
  spec_file: text(500).optional(), title: text(500).optional(), tags: z.array(text(100)).max(50).optional(),
  started_at: iso.optional(), worker: z.number().int().min(0).max(1000).optional(), retries: z.number().int().min(0).max(100).optional(),
  outcome: z.enum(['passed', 'failed', 'known_defect', 'not_tested', 'timed_out', 'interrupted']).optional(),
  not_tested_reason: text(1000).optional(), error_head: text(1000).optional(), fixture_engine: text(200).optional(),
  artifacts: z.array(z.object({ kind: z.enum(['screenshot', 'trace', 'error_context', 'log']), url: z.url({ protocol: /^https?$/ }).max(1000) })).max(20).optional(),
})
export const RESULT_FIELDS = ['tc_id', 'status', 'duration_ms', 'error', 'url', 'defect_id', ...Object.keys(ResultTelemetry.shape)]

/** A finer outcome as one of the results Launchpad counts. */
export const resultOf = (outcome: string | undefined, status: string): string =>
  outcome === 'timed_out' ? 'failed' : outcome === 'not_tested' || outcome === 'interrupted' ? 'skipped' : outcome ?? status

// ---- Analysis -----------------------------------------------------------------------------------

export type RunResultRow = { tc_id: string; zone: string; page: string; result: string; outcome: string | null; duration_ms: number | null; not_tested_reason: string | null; error_head: string | null; note: string | null; title: string }

/** Passed, failed, known defect and not tested, by zone and page. */
export function countsByPage(rows: RunResultRow[]) {
  const m = new Map<string, { zone: string; page: string; passed: number; failed: number; known_defect: number; not_tested: number; total: number }>()
  for (const r of rows) {
    const k = `${r.zone} · ${r.page}`
    const x = m.get(k) ?? { zone: r.zone, page: r.page, passed: 0, failed: 0, known_defect: 0, not_tested: 0, total: 0 }
    x.total++
    if (r.result === 'passed') x.passed++
    else if (r.result === 'failed') x.failed++
    else if (r.result === 'known_defect') x.known_defect++
    else x.not_tested++
    m.set(k, x)
  }
  return [...m.values()].sort((a, b) => a.zone.localeCompare(b.zone) || a.page.localeCompare(b.page))
}

/** Why tests were not tested, most common first. */
export function notTestedReasons(rows: RunResultRow[]) {
  const m = new Map<string, number>()
  for (const r of rows) if (r.result === 'skipped') { const k = (r.not_tested_reason ?? r.note ?? 'No reason given').split('\n')[0].slice(0, 200); m.set(k, (m.get(k) ?? 0) + 1) }
  return [...m.entries()].map(([reason, n]) => ({ reason, n })).sort((a, b) => b.n - a.n)
}

export const slowest = (rows: RunResultRow[], n = 15) => rows.filter((r) => r.duration_ms != null).sort((a, b) => b.duration_ms! - a.duration_ms!).slice(0, n)

const pct = (sorted: number[], p: number) => sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))]
/** Each wait site's count, median, 95th percentile and worst, slowest first. */
export function waitsBySite(waits: { site: string; ms: number }[]) {
  const m = new Map<string, number[]>()
  for (const w of waits) m.set(w.site, [...(m.get(w.site) ?? []), w.ms])
  return [...m.entries()].map(([site, ms]) => {
    const s = [...ms].sort((a, b) => a - b)
    return { site, n: s.length, p50: pct(s, 50), p95: pct(s, 95), max: s.at(-1)!, total: s.reduce((x, y) => x + y, 0) }
  }).sort((a, b) => b.total - a.total)
}

/**
 * Against the previous run: new failures (passed then, failed now), fixed (failed then, passed
 * now), and tests that took much longer (at least half again, and five seconds, more).
 */
export function delta(now: { tc_id: string; result: string; duration_ms: number | null }[], before: { tc_id: string; result: string; duration_ms: number | null }[]) {
  const prev = new Map(before.map((r) => [r.tc_id, r]))
  const failing = (r: string) => r === 'failed'
  const newFailures: string[] = [], fixed: string[] = [], slower: { tc_id: string; before: number; now: number }[] = []
  for (const r of now) {
    const p = prev.get(r.tc_id)
    if (!p) continue
    if (failing(r.result) && p.result === 'passed') newFailures.push(r.tc_id)
    if (r.result === 'passed' && failing(p.result)) fixed.push(r.tc_id)
    if (r.duration_ms != null && p.duration_ms != null && r.duration_ms >= p.duration_ms * 1.5 && r.duration_ms - p.duration_ms >= 5000) slower.push({ tc_id: r.tc_id, before: p.duration_ms, now: r.duration_ms })
  }
  return { newFailures, fixed, slower: slower.sort((a, b) => (b.now - b.before) - (a.now - a.before)) }
}
