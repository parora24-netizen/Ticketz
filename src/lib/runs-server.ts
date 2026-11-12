import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { RunResultRow } from '@/lib/runs'

/**
 * Reading suite runs, for the API and the app alike. A run posted only as results (before runs had a
 * lifecycle) is read from its results, so old runs open too.
 */
type Db = SupabaseClient
export type SuiteRun = {
  run_id: string; kind: string; target: string | null; branch: string | null; commit: string | null; bundle: string | null; bundle_end: string | null
  workers: number | null; tests_planned: number | null; tests_done: number | null; passed: number | null; failed: number | null; known_defect: number | null; not_tested: number | null
  launcher: string | null; started_at: string; eta: string | null; finished_at: string | null; exit: string | null; confounded: boolean
  wall_min: number | null; worker_min: number | null; creates_failed: number | null; rate_limit_waits: number | null; http_503: number | null; lock_wait_min: number | null
  build?: string | null; recorded: boolean
}

const one = <T,>(v: unknown) => ((Array.isArray(v) ? v[0] : v) ?? null) as T | null

/** Every run, newest first: those with a lifecycle, and older ones known only from their results. */
export async function listRuns(db: Db, f: { kind?: string; since?: string; limit?: number } = {}): Promise<SuiteRun[]> {
  let q = db.from('suite_runs').select('*').order('started_at', { ascending: false }).limit(f.limit ?? 100)
  if (f.kind) q = q.eq('kind', f.kind)
  if (f.since) q = q.gte('started_at', f.since)
  const [{ data: runs }, { data: legacy }] = await Promise.all([q, f.kind && f.kind !== 'full' ? Promise.resolve({ data: [] }) : db.from('ci_runs').select('*').order('posted_at', { ascending: false }).limit(f.limit ?? 100)])
  const known = new Set((runs ?? []).map((r) => r.run_id))
  const old = (legacy ?? []).filter((r) => r.run_id && !known.has(r.run_id) && (!f.since || r.posted_at >= f.since)).map((r): SuiteRun => ({
    run_id: r.run_id, kind: 'full', target: null, branch: null, commit: null, bundle: r.build, bundle_end: null, workers: null, tests_planned: null,
    tests_done: r.results, passed: r.passed, failed: r.failed, known_defect: r.known_defect, not_tested: r.skipped, launcher: r.token ?? null,
    started_at: r.posted_at, eta: null, finished_at: r.posted_at, exit: 'finished', confounded: false, wall_min: null, worker_min: null,
    creates_failed: null, rate_limit_waits: null, http_503: null, lock_wait_min: null, build: r.build, recorded: false,
  }))
  return [...(runs ?? []).map((r) => ({ ...r, recorded: true }) as SuiteRun), ...old].sort((a, b) => b.started_at.localeCompare(a.started_at)).slice(0, f.limit ?? 100)
}

export async function getRun(db: Db, runId: string): Promise<SuiteRun | null> {
  const { data } = await db.from('suite_runs').select('*').eq('run_id', runId).maybeSingle()
  if (data) return { ...data, recorded: true } as SuiteRun
  return (await listRuns(db, { limit: 500 })).find((r) => r.run_id === runId) ?? null
}

/** A run's results, one row per case, with the case's page. */
export async function runResults(db: Db, runId: string): Promise<(RunResultRow & { worker: number | null; retries: number | null; spec_file: string | null; artifacts: unknown; defect_id: string | null; build: string | null })[]> {
  const out = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('test_runs')
      .select('result, outcome, duration_ms, not_tested_reason, error_head, note, worker, retries, spec_file, test_title, artifacts, defect_id, build, test_cases!inner(tc_id, title, areas(zone, page))')
      .eq('run_id', runId).eq('kind', 'auto').order('recorded_at').range(from, from + 999)
    if (error) throw new Error(error.message)
    for (const r of data ?? []) {
      const c = one<{ tc_id: string; title: string; areas: unknown }>(r.test_cases)!
      const a = one<{ zone: string; page: string }>(c.areas)
      out.push({ tc_id: c.tc_id, title: r.test_title ?? c.title, zone: a?.zone ?? '', page: a?.page ?? '', result: r.result, outcome: r.outcome, duration_ms: r.duration_ms,
        not_tested_reason: r.not_tested_reason, error_head: r.error_head, note: r.note, worker: r.worker, retries: r.retries, spec_file: r.spec_file, artifacts: r.artifacts, defect_id: r.defect_id, build: r.build })
    }
    if ((data ?? []).length < 1000) break
  }
  return out
}

/** The full run before this one, for what changed. */
export async function previousFullRun(db: Db, run: SuiteRun): Promise<SuiteRun | null> {
  return (await listRuns(db, { kind: 'full', limit: 200 })).find((r) => r.run_id !== run.run_id && r.started_at < run.started_at) ?? null
}

/** One case's automated results across runs, oldest first. */
export async function caseHistory(db: Db, caseId: string, limit = 60) {
  const { data } = await db.from('test_runs').select('run_id, build, result, outcome, duration_ms, recorded_at, error_head, note, defect_id')
    .eq('case_id', caseId).eq('kind', 'auto').order('recorded_at', { ascending: false }).limit(limit)
  return (data ?? []).reverse()
}

/** A run as the API returns it. */
export const runJson = (r: SuiteRun) => ({
  ...Object.fromEntries(Object.entries(r).filter(([k]) => k !== 'recorded' && k !== 'build')),
  pass_rate: r.tests_done ? Math.round(((r.passed ?? 0) / r.tests_done) * 1000) / 10 : null,
  has_lifecycle: r.recorded,
  // Names from before runs had a lifecycle, for callers that read them.
  posted_at: r.finished_at ?? r.started_at, results: r.tests_done, skipped: r.not_tested, build: r.build ?? r.bundle,
})

