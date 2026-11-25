import { z } from 'zod'

/**
 * Test case text through the API, for tokens with the "cases" scope: edit a case's words, add a
 * case, retire or defer one. Kept apart from the automation fields, which a runner token sets.
 */

const TcId = z.string().trim().min(1).max(40).transform((s) => s.toUpperCase())
const text = (max: number) => z.string().trim().max(max)
const PRIORITY = ['Critical', 'High', 'Medium', 'Low'] as const

/** The text fields a PATCH may change. */
export const TEXT_FIELDS = ['title', 'preconditions', 'steps', 'test_data', 'expected', 'priority'] as const
/** Keys that make a PATCH a text change rather than an automation one. */
export const TEXT_KEYS = [...TEXT_FIELDS, 'retired', 'retired_as', 'retired_reason', 'comment'] as const

export const CaseText = z.strictObject({
  title: text(300).min(3).optional(),
  preconditions: text(5000).nullable().optional(),
  steps: text(10000).nullable().optional(),
  test_data: text(5000).nullable().optional(),
  expected: text(5000).nullable().optional(),
  priority: z.enum(PRIORITY).optional(),
  /** true retires (or, with retired_as "deferred", defers) the case; false restores it. */
  retired: z.boolean().optional(),
  retired_as: z.enum(['retired', 'deferred']).optional(),
  retired_reason: text(2000).min(3).optional(),
  /** Why, with the evidence (run, build): posted as a comment on the case by the token's person. */
  comment: text(5000).min(1).optional(),
  /** The revision the change was made against; if the case has moved on, nothing changes (409). */
  revision: z.number().int().min(1).optional(),
}).refine((p) => !p.retired || !!p.retired_reason, { message: 'Retiring or deferring needs retired_reason', path: ['retired_reason'] })
export type CaseTextInput = z.infer<typeof CaseText>

export const BulkCaseText = z.strictObject({ cases: z.array(z.object({ tc_id: TcId }).passthrough()).min(1).max(500) })

export const CaseCreate = z.strictObject({
  zone: text(100).min(1),
  page: text(100).min(1),
  title: text(300).min(3),
  preconditions: text(5000).optional(),
  steps: text(10000).optional(),
  test_data: text(5000).optional(),
  expected: text(5000).optional(),
  priority: z.enum(PRIORITY).default('Medium'),
  test_type: text(50).optional(),
  /** A person's name, as on the team list. */
  tester: text(100).optional(),
  /** e.g. TS_12; left out, the case joins its page's scenario. */
  scenario_id: z.string().trim().regex(/^TS_\d+$/i, 'scenario_id looks like TS_12').optional(),
  comment: text(5000).min(1).optional(),
})
export type CaseCreateInput = z.infer<typeof CaseCreate>

/** True when a body (or one bulk item) asks for a text change. */
export const isTextChange = (body: unknown) => !!body && typeof body === 'object' && TEXT_KEYS.some((k) => k in (body as object))
/** True when a body also carries automation fields, which go through a separate call. */
export const hasAutomationKeys = (body: unknown) => !!body && typeof body === 'object' && Object.keys(body as object).some((k) => k.startsWith('automation'))
