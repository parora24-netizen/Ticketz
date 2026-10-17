import { z } from 'zod'

/** What the automated suite posts after a run. One result per tagged test case. */
export const ResultsPayload = z.object({
  build: z.string().trim().min(1).max(100),
  run_id: z.string().trim().min(1).max(200),
  results: z
    .array(
      z.object({
        tc_id: z.string().trim().regex(/^TC_[A-Za-z0-9_]+$/, 'tc_id looks like TC_FN_070'),
        status: z.enum(['passed', 'failed', 'skipped', 'known_defect']),
        duration_ms: z.number().int().nonnegative().max(86_400_000).optional(),
        error: z.string().max(4000).optional(),
        url: z.url({ protocol: /^https?$/ }).max(1000).optional(),
      }),
    )
    .min(1)
    .max(5000),
})
export type ResultsPayload = z.infer<typeof ResultsPayload>

/** Bearer token from an Authorization header, or null. */
export function bearer(header: string | null): string | null {
  const m = /^Bearer\s+(\S+)$/i.exec(header ?? '')
  return m ? m[1] : null
}

/** Keep the last result per test case when a run reports one twice (e.g. a retried test). */
export function lastPerCase(results: ResultsPayload['results']): ResultsPayload['results'] {
  const byId = new Map<string, ResultsPayload['results'][number]>()
  for (const r of results) byId.set(r.tc_id.toUpperCase(), { ...r, tc_id: r.tc_id.toUpperCase() })
  return [...byId.values()]
}
