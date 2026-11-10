import { z } from 'zod'
import { TICKET_STATES } from '@/lib/workflow/ticket-machine'

/**
 * The tickets API's full create and change payloads. Strict: a field the API does not take is a
 * 400 that names the ones it does, never silently dropped.
 */
const Severity = z.enum(['Critical', 'High', 'Medium', 'Low'])
const Key = z.string().trim().min(1).max(60).transform((s) => s.toUpperCase())
const Keys = z.array(Key).max(50)
const TcId = z.string().trim().min(1).max(40).transform((s) => s.toUpperCase())
const Name = z.string().trim().min(1).max(100)
const Url = z.url({ protocol: /^https?$/ }).max(1000)

export const TicketCreate = z.strictObject({
  kind: z.enum(['defect', 'test_mismatch', 'task']).default('defect'),
  title: z.string().trim().min(3).max(300).optional(),
  description: z.string().trim().max(10000).optional(),
  severity: Severity.optional(),
  priority: Severity.optional(),
  owner: Name.optional(),
  accountable: Name.optional(),
  area: z.string().trim().max(200).optional(),
  zone: z.string().trim().max(100).optional(),
  page: z.string().trim().max(100).optional(),
  sprint: z.string().trim().max(40).optional(),
  tc_id: TcId.optional(),
  tc_ids: z.array(TcId).max(200).optional(),
  requirement_ids: z.array(z.string().trim().min(1).max(60)).max(100).optional(),
  defect_id: z.string().trim().min(1).max(100).optional(),
  external_ref: z.string().trim().min(1).max(200).optional(),
  depends_on: Keys.optional(),
  related: Keys.optional(),
  parent: Key.optional(),
  blocked: z.string().trim().min(1).max(2000).optional(),
  build: z.string().trim().max(100).optional(),
  run_id: z.string().trim().max(200).optional(),
  error: z.string().max(4000).optional(),
  url: Url.optional(),
}).refine((p) => p.title || p.tc_id || p.tc_ids?.length, { message: 'Send a title, or a tc_id for a ticket about a failing case', path: ['title'] })
  .refine((p) => p.kind !== 'test_mismatch' || p.tc_id || p.tc_ids?.length, { message: 'A test_mismatch ticket needs a tc_id', path: ['kind'] })
export type TicketCreate = z.infer<typeof TicketCreate>

export const TicketChange = z.strictObject({
  title: z.string().trim().min(3).max(300).optional(),
  description: z.string().trim().max(10000).nullable().optional(),
  severity: Severity.optional(),
  priority: Severity.nullable().optional(),
  owner: Name.nullable().optional(),
  accountable: Name.nullable().optional(),
  area: z.string().trim().max(200).nullable().optional(),
  sprint: z.string().trim().max(40).nullable().optional(),
  state: z.enum(TICKET_STATES).optional(),
  duplicate_of: Key.optional(),
  defer_reason: z.string().trim().min(1).max(2000).optional(),
  fixed_in_build: z.string().trim().min(1).max(100).nullable().optional(),
  blocked: z.string().trim().min(1).max(2000).nullable().optional(),
  defect_id: z.string().trim().min(1).max(100).nullable().optional(),
  requirement_ids: z.array(z.string().trim().min(1).max(60)).max(100).nullable().optional(),
  tc_ids: z.array(TcId).max(200).optional(),
  depends_on: Keys.optional(),
  related: Keys.optional(),
  parent: Key.nullable().optional(),
  external_ref: z.string().trim().min(1).max(200).nullable().optional(),
}).refine((p) => Object.keys(p).length > 0, { message: 'Send at least one field to change' })
export type TicketChange = z.infer<typeof TicketChange>

/** PATCH /api/tickets: the same change to many tickets, or a change per ticket. */
export const BulkChange = z.union([
  z.strictObject({ keys: z.array(Key).min(1).max(200), set: TicketChange }),
  z.strictObject({ tickets: z.array(z.object({ key: Key }).passthrough()).min(1).max(200) }),
])

export const BulkCreate = z.array(z.unknown()).min(1).max(200)

/** Which scope a change needs: giving a ticket to someone is "assign", the rest "update". */
export const scopeFor = (p: Record<string, unknown>) => (Object.keys(p).every((k) => k === 'owner' || k === 'accountable') ? 'assign' : 'update')
export const needsAssign = (p: Record<string, unknown>) => 'owner' in p || 'accountable' in p

/** "Logic Builder · Objects", "Logic Builder / Objects" or "Logic Builder > Objects" as a zone and page. */
export function splitArea(area: string): { zone: string; page: string } | null {
  const parts = area.split(/\s*[·/›>|]\s*/).map((s) => s.trim()).filter(Boolean)
  return parts.length === 2 ? { zone: parts[0], page: parts[1] } : null
}

/** A zod error as the fields the payload can carry, for a 400 that says what is accepted. */
export function issuesOf(e: z.ZodError, accepted: string[]) {
  const unknown = e.issues.flatMap((i) => (i.code === 'unrecognized_keys' ? i.keys : []))
  return {
    error: unknown.length ? `Not accepted: ${unknown.join(', ')}` : e.issues[0]?.message ?? 'Invalid payload',
    issues: e.issues.slice(0, 10).map((i) => ({ path: i.path.join('.'), message: i.message })),
    accepted,
  }
}
export const CREATE_FIELDS = Object.keys(TicketCreate.shape)
export const CHANGE_FIELDS = Object.keys(TicketChange.shape)
