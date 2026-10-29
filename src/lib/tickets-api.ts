import { z } from 'zod'
import { canMove, type TicketState } from '@/lib/workflow/ticket-machine'

/**
 * The tickets API for the automated suite (and other tools), next to /api/results. It acts with
 * QA's rights: it can raise tickets, comment and record retests, never skip a workflow step.
 * Pure parts here; the route handlers do the database work.
 */

const TcId = z.string().trim().regex(/^TC_[A-Za-z0-9_]+$/i, 'tc_id looks like TC_FN_070').transform((s) => s.toUpperCase())
const Url = z.url({ protocol: /^https?$/ }).max(1000)
/** Your id for a recorded defect, e.g. DEF-12. One defect can fail several cases; it keeps them on one ticket. */
export const DefectId = z.string().trim().min(1).max(100)
const iso = z.iso.datetime({ offset: true })
const limit = z.coerce.number().int().min(1).max(1000).default(200)
const offset = z.coerce.number().int().min(0).default(0)
const list = (s: string | undefined) => s?.split(',').map((x) => x.trim()).filter(Boolean)

/** POST /api/tickets: raise a ticket for a failing test case, or add to the open one. */
export const RaisePayload = z.object({
  tc_id: TcId,
  kind: z.enum(['defect', 'test_mismatch']).default('defect'),
  title: z.string().trim().min(3).max(300).optional(),
  description: z.string().trim().max(4000).optional(),
  severity: z.enum(['Critical', 'High', 'Medium', 'Low']).optional(),
  build: z.string().trim().max(100).optional(),
  run_id: z.string().trim().max(200).optional(),
  error: z.string().max(4000).optional(),
  url: Url.optional(),
  defect_id: DefectId.optional(),
})
export type RaisePayload = z.infer<typeof RaisePayload>

/** POST /api/tickets/{key}/comments */
export const CommentPayload = z.object({ body: z.string().trim().min(1).max(4000) })

/** POST /api/tickets/{key}/retest: the automated retest of a fix. */
export const RetestPayload = z.object({
  result: z.enum(['passed', 'failed']),
  build: z.string().trim().min(1).max(100),
  run_id: z.string().trim().max(200).optional(),
  note: z.string().trim().max(4000).optional(),
  url: Url.optional(),
})
export type RetestPayload = z.infer<typeof RetestPayload>

export const OPEN: TicketState[] = ['new', 'triaged', 'in_fix', 'reopened', 'ready_for_retest']
const STATES = ['new', 'triaged', 'in_fix', 'ready_for_retest', 'reopened', 'closed', 'deferred', 'duplicate'] as const

/** GET /api/tickets query: state (comma list, or "open"), tc_id, sprint, severity, kind, updated_since, limit. */
export const ListQuery = z.object({
  state: z.string().optional().transform((s, ctx) => {
    if (!s) return undefined
    const list = s.split(',').map((x) => x.trim().toLowerCase()).filter(Boolean)
    const out = list.flatMap((x) => (x === 'open' ? OPEN : [x]))
    const bad = out.filter((x) => !(STATES as readonly string[]).includes(x))
    if (bad.length) { ctx.addIssue({ code: 'custom', message: `Unknown state: ${bad.join(', ')}` }); return z.NEVER }
    return [...new Set(out)] as TicketState[]
  }),
  tc_id: z.string().optional().transform((s) => list(s)?.map((x) => x.toUpperCase())),
  defect_id: z.string().optional().transform(list),
  sprint: z.string().trim().optional(),
  severity: z.enum(['Critical', 'High', 'Medium', 'Low']).optional(),
  kind: z.enum(['defect', 'test_mismatch']).optional(),
  updated_since: iso.optional(),
  limit,
})

/** GET /api/cases query: tc_id, zone, page, updated_since, limit, offset. */
export const CasesQuery = z.object({
  tc_id: z.string().optional().transform((s) => list(s)?.map((x) => x.toUpperCase())),
  zone: z.string().trim().optional(),
  page: z.string().trim().optional(),
  updated_since: iso.optional(),
  limit,
  offset,
})

/**
 * GET /api/results query: latest=true for each case's latest automated and manual result, otherwise
 * every result recorded since updated_since (oldest first, so paging with offset is stable).
 */
export const ResultsQuery = z.object({
  tc_id: z.string().optional().transform((s) => list(s)?.map((x) => x.toUpperCase())),
  kind: z.enum(['auto', 'manual']).optional(),
  result: z.string().optional().transform(list),
  sprint: z.string().trim().optional(),
  run_id: z.string().trim().optional(),
  defect_id: DefectId.optional(),
  updated_since: iso.optional(),
  latest: z.enum(['true', 'false']).optional().transform((v) => v === 'true'),
  /** With latest=true: type_i (automation failed, manual passed), type_ii (passed, manual failed), or any. */
  mismatch: z.enum(['type_i', 'type_ii', 'any']).optional(),
  limit,
  offset,
})

/** Ticket keys follow the workbook: DEV-TC_FN_070 for a defect, MM-TC_FN_070 for a mismatch; -2, -3 when taken. */
export function nextKey(kind: 'defect' | 'test_mismatch', tcId: string, taken: Set<string>): string {
  const base = `${kind === 'defect' ? 'DEV' : 'MM'}-${tcId}`
  if (!taken.has(base)) return base
  for (let n = 2; ; n++) if (!taken.has(`${base}-${n}`)) return `${base}-${n}`
}

/** The ticket description from a failure: what was sent, plus where it came from. */
export function failureText(p: Pick<RaisePayload, 'description' | 'error' | 'build' | 'run_id' | 'url'>): string {
  return [
    p.description,
    p.error && `Error: ${p.error}`,
    [p.build && `Build ${p.build}`, p.run_id && `run ${p.run_id}`].filter(Boolean).join(', '),
    p.url && `Report: ${p.url}`,
  ].filter(Boolean).join('\n')
}

/** What an automated retest does to a ticket, by QA's rules: a pass closes it, a fail reopens it. */
export function retestMove(state: TicketState, result: 'passed' | 'failed'): { to: TicketState } | { error: string } {
  if (state !== 'ready_for_retest') return { error: `The ticket is ${state.replaceAll('_', ' ')}, not ready for retest` }
  const to: TicketState = result === 'passed' ? 'closed' : 'reopened'
  return canMove(state, to, 'qa') ? { to } : { error: 'That step is not allowed' }
}
