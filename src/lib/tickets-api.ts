import { z } from 'zod'
import { canMove, type TicketState } from '@/lib/workflow/ticket-machine'

/**
 * The tickets API for the automated suite (and other tools), next to /api/results. It acts with
 * QA's rights: it can raise tickets, comment and record retests, never skip a workflow step.
 * Pure parts here; the route handlers do the database work.
 */

const TcId = z.string().trim().regex(/^TC_[A-Za-z0-9_]+$/i, 'tc_id looks like TC_70').transform((s) => s.toUpperCase())
const Url = z.url({ protocol: /^https?$/ }).max(1000)
/** Your id for a recorded defect, e.g. DEF-12. One defect can fail several cases; it keeps them on one ticket. */
export const DefectId = z.string().trim().min(1).max(100)
const iso = z.iso.datetime({ offset: true })
const limit = z.coerce.number().int().min(1).max(1000).default(200)
const offset = z.coerce.number().int().min(0).default(0)
const list = (s: string | undefined) => s?.split(',').map((x) => x.trim()).filter(Boolean)

/**
 * POST /api/tickets: raise a ticket for a failing test case, or add to the open one. Without a
 * tc_id it is a ticket of its own (needs a title), optionally on a zone and page.
 */
export const RaisePayload = z.object({
  tc_id: TcId.optional(),
  zone: z.string().trim().max(100).optional(),
  page: z.string().trim().max(100).optional(),
  kind: z.enum(['defect', 'test_mismatch']).default('defect'),
  title: z.string().trim().min(3).max(300).optional(),
  description: z.string().trim().max(4000).optional(),
  severity: z.enum(['Critical', 'High', 'Medium', 'Low']).optional(),
  build: z.string().trim().max(100).optional(),
  run_id: z.string().trim().max(200).optional(),
  error: z.string().max(4000).optional(),
  url: Url.optional(),
  defect_id: DefectId.optional(),
}).refine((p) => p.tc_id || p.title, { message: 'Send a tc_id, or a title for a ticket without a test case', path: ['title'] })
  .refine((p) => p.tc_id || p.kind === 'defect', { message: 'A test_mismatch ticket needs a tc_id', path: ['kind'] })
export type RaisePayload = z.infer<typeof RaisePayload>

/** POST /api/tickets/{key}/comments */
export const COMMENT_MAX = 5000
export const CommentPayload = z.object({ body: z.string().trim().min(1).max(COMMENT_MAX) })

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
  kind: z.enum(['defect', 'test_mismatch', 'task']).optional(),
  owner: z.string().trim().optional(),
  accountable: z.string().trim().optional(),
  created_by: z.string().trim().optional(),
  area: z.string().trim().optional(),
  external_ref: z.string().trim().optional(),
  updated_since: iso.optional(),
  limit,
})

/**
 * The automation states the API speaks. Launchpad stores "not automatable" as manual_only, which is
 * what the app has always called it.
 */
export const AUTOMATION_STATUSES = ['not_automated', 'in_progress', 'automated', 'blocked', 'not_automatable'] as const
export type AutomationStatus = (typeof AUTOMATION_STATUSES)[number]
export const automationToDb = (s: AutomationStatus) => (s === 'not_automatable' ? 'manual_only' : s)
export const automationFromDb = (s: string): AutomationStatus => (s === 'manual_only' ? 'not_automatable' : s as AutomationStatus)


const oneOf = <T extends string>(allowed: readonly T[]) => z.string().optional().transform((s, ctx) => {
  const values = list(s)
  const bad = values?.find((v) => !allowed.includes(v as T))
  if (bad) {
    ctx.addIssue({ code: 'custom', message: `"${bad}" is not one of ${allowed.join(', ')}` })
    return z.NEVER
  }
  return values as T[] | undefined
})

/**
 * GET /api/cases query: tc_id, scenario_id, requirement_id, zone, page, automation, priority, type,
 * updated_since (any change), text_updated_since (the case's wording only), limit, offset.
 */
export const CasesQuery = z.object({
  automation: oneOf(AUTOMATION_STATUSES),
  priority: oneOf(['Critical', 'High', 'Medium', 'Low'] as const),
  type: z.string().optional().transform(list),
  text_updated_since: iso.optional(),
  /** true: only cases whose Expected is a placeholder; false: leave them out (the automation backlog). */
  needs_detail: z.enum(['true', 'false']).optional().transform((v) => (v === undefined ? undefined : v === 'true')),
  block: z.string().optional().transform(list),
  tc_id: z.string().optional().transform((s) => list(s)?.map((x) => x.toUpperCase())),
  scenario_id: z.string().optional().transform(list),
  requirement_id: z.string().optional().transform(list),
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
  /** With latest=true only. */
  zone: z.string().trim().optional(),
  page: z.string().trim().optional(),
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

/** GET /api/runs query: run_id, build, updated_since (posted at or after), limit, offset. */
export const RunsQuery = z.object({
  run_id: z.string().optional().transform(list),
  build: z.string().optional().transform(list),
  updated_since: iso.optional(),
  limit,
  offset,
})

/** Other names callers use for updated_since. */
const SINCE_ALIASES = ['since', 'updated_after']

/**
 * Reads a list call's query string. since and updated_after mean updated_since, and a filter the
 * call does not know is an error rather than silently ignored (which would return everything).
 */
export function readQuery<T extends z.ZodObject>(schema: T, params: URLSearchParams): z.ZodSafeParseResult<z.output<T>> {
  const q: Record<string, string> = {}
  for (const [k, v] of params) q[SINCE_ALIASES.includes(k) ? 'updated_since' : k] ??= v
  if (params.has('updated_since')) q.updated_since = params.get('updated_since')!
  return schema.strict().safeParse(q) as z.ZodSafeParseResult<z.output<T>>
}

/**
 * What an automated failure raises: a defect, unless the latest manual test passed. Then automation
 * and a person disagree, which is a mismatch, and the automated test usually needs the fixing.
 */
export const failureKind = (manualResult: string | null | undefined): 'defect' | 'test_mismatch' =>
  manualResult === 'passed' ? 'test_mismatch' : 'defect'

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
