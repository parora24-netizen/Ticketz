import 'server-only'
import type Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { loadAreas, loadCases, loadPeople, loadSprintAreas, loadSprints, loadTickets, type CaseRow, type TicketRow } from '@/lib/data'

/**
 * Read-only tools for the assistant. Every query runs as the signed-in person (their session and
 * the database's row rules), so the assistant can see only what they can see and change nothing.
 * Results are trimmed to what an answer needs.
 */

const OPEN = ['new', 'triaged', 'in_fix', 'reopened', 'ready_for_retest']
const has = (hay: string | null | undefined, needle?: string) => !needle || (hay ?? '').toLowerCase().includes(needle.toLowerCase())
const inList = (v: string | null | undefined, list?: string[]) => !list?.length || list.map((x) => x.toLowerCase()).includes((v ?? '').toLowerCase())

const TicketFilters = z.object({
  text: z.string().optional().describe('Words in the key or title'),
  states: z.array(z.enum(['new', 'triaged', 'in_fix', 'ready_for_retest', 'reopened', 'closed', 'deferred', 'duplicate'])).optional(),
  open_only: z.boolean().optional().describe('Only tickets not yet closed, deferred or duplicate'),
  severities: z.array(z.enum(['Critical', 'High', 'Medium', 'Low'])).optional(),
  sprint: z.string().optional().describe('Sprint name, e.g. F1'),
  owner: z.string().optional().describe('Owner name (part of it is fine), or "none" for unassigned'),
  zone: z.string().optional(),
  page: z.string().optional(),
  kind: z.enum(['defect', 'test_mismatch']).optional().describe('defect = product bug (DEV-); test_mismatch = automated test disagrees with manual (MM-)'),
  blocked: z.boolean().optional(),
})
type TicketFilter = z.infer<typeof TicketFilters>

const CaseFilters = z.object({
  text: z.string().optional().describe('Words in the ID or title'),
  zone: z.string().optional(),
  page: z.string().optional(),
  sprint: z.string().optional().describe('Test sprint name, e.g. T1: its areas'),
  priorities: z.array(z.enum(['Critical', 'High', 'Medium', 'Low'])).optional(),
  automation: z.enum(['automated', 'not_automated', 'manual_only']).optional(),
  tester: z.string().optional().describe('Tester name (part of it is fine), or "none"'),
  manual_result: z.enum(['passed', 'failed', 'blocked', 'known_defect', 'skipped', 'none']).optional(),
  auto_result: z.enum(['passed', 'failed', 'blocked', 'known_defect', 'skipped', 'none']).optional(),
  with_open_ticket: z.boolean().optional(),
})
type CaseFilter = z.infer<typeof CaseFilters>

async function context() {
  const [tickets, cases, sprints, sprintAreas, people, areas] = await Promise.all([loadTickets(), loadCases(), loadSprints(), loadSprintAreas(), loadPeople(), loadAreas()])
  const sprintByName = new Map(sprints.map((s) => [s.name.toLowerCase(), s]))
  const sprintName = new Map(sprints.map((s) => [s.id, s.name]))
  const personByName = (q: string) => people.filter((p) => p.name.toLowerCase().includes(q.toLowerCase())).map((p) => p.id)
  return { tickets, cases, sprints, sprintAreas, people, areas, sprintByName, sprintName, personByName }
}
type Ctx = Awaited<ReturnType<typeof context>>

function filterTickets(ctx: Ctx, f: TicketFilter): TicketRow[] {
  const sprint = f.sprint ? ctx.sprintByName.get(f.sprint.toLowerCase()) : undefined
  const owners = f.owner && f.owner.toLowerCase() !== 'none' ? ctx.personByName(f.owner) : null
  return ctx.tickets.filter((t) =>
    (has(t.key, f.text) || has(t.title, f.text)) &&
    inList(t.state, f.states) && (!f.open_only || OPEN.includes(t.state)) &&
    inList(t.severity, f.severities) &&
    (!f.sprint || t.current_sprint_id === sprint?.id) &&
    (!f.owner || (owners ? !!t.owner_id && owners.includes(t.owner_id) : !t.owner_id)) &&
    has(t.zone, f.zone) && has(t.page, f.page) &&
    (!f.kind || t.kind === f.kind) &&
    (f.blocked === undefined || !!t.blocked_reason === f.blocked))
}

function filterCases(ctx: Ctx, f: CaseFilter): CaseRow[] {
  const sprint = f.sprint ? ctx.sprintByName.get(f.sprint.toLowerCase()) : undefined
  const sprintAreaIds = sprint ? new Set(ctx.sprintAreas.filter((x) => x.sprint_id === sprint.id).map((x) => x.area_id)) : null
  const testers = f.tester && f.tester.toLowerCase() !== 'none' ? ctx.personByName(f.tester) : null
  const result = (v: string | null, want?: string) => !want || (want === 'none' ? v === null : v === want)
  return ctx.cases.filter((c) =>
    (has(c.tc_id, f.text) || has(c.title, f.text)) &&
    has(c.zone, f.zone) && has(c.page, f.page) &&
    (!f.sprint || !!sprintAreaIds?.has(c.area_id)) &&
    inList(c.priority, f.priorities) &&
    (!f.automation || c.automation === f.automation) &&
    (!f.tester || (testers ? !!c.tester_id && testers.includes(c.tester_id) : !c.tester_id)) &&
    result(c.manual_result, f.manual_result) && result(c.auto_result, f.auto_result) &&
    (f.with_open_ticket === undefined || (c.open_fix + c.awaiting_retest > 0) === f.with_open_ticket))
}

const ticketBrief = (ctx: Ctx, t: TicketRow) => ({
  key: t.key, title: t.title, severity: t.severity, state: t.state, kind: t.kind,
  owner: t.owner_name, sprint: t.current_sprint_id ? ctx.sprintName.get(t.current_sprint_id) : null,
  area: t.zone ? `${t.zone} · ${t.page}` : null, case: t.tc_id, logged_on: t.logged_on,
  fixed_in_build: t.fixed_in_build, blocked: t.blocked_reason,
})
const caseBrief = (c: CaseRow) => ({
  tc_id: c.tc_id, title: c.title, priority: c.priority, area: `${c.zone} · ${c.page}`, automation: c.automation,
  tester: c.tester_name, last_auto: c.auto_result, last_manual: c.manual_result, open_tickets: c.open_fix + c.awaiting_retest,
})

function countBy<T>(rows: T[], key: (r: T) => string | null | undefined) {
  const m = new Map<string, number>()
  for (const r of rows) { const k = key(r) || '(none)'; m.set(k, (m.get(k) ?? 0) + 1) }
  return Object.fromEntries([...m.entries()].sort((a, b) => b[1] - a[1]))
}

type ToolDef = { tool: Anthropic.Beta.BetaTool; input: z.ZodType; run: (ctx: Ctx, input: never) => Promise<unknown> | unknown; label: string }

const schema = (s: z.ZodType) => {
  const json = z.toJSONSchema(s) as Record<string, unknown>
  delete json.$schema
  return json as Anthropic.Beta.BetaTool['input_schema']
}

function def<S extends z.ZodType>(name: string, label: string, description: string, input: S, run: (ctx: Ctx, input: z.infer<S>) => unknown): ToolDef {
  return { tool: { name, description, input_schema: schema(input), eager_input_streaming: true }, input, run: run as ToolDef['run'], label }
}

export const TOOLS: ToolDef[] = [
  def('search_tickets', 'Looking up tickets',
    'Find tickets by any mix of filters. Returns up to `limit` tickets (most severe first) and the total that match.',
    TicketFilters.extend({ limit: z.number().int().min(1).max(100).optional() }),
    (ctx, f) => {
      const SEV = ['Critical', 'High', 'Medium', 'Low']
      const rows = filterTickets(ctx, f).sort((a, b) => SEV.indexOf(a.severity) - SEV.indexOf(b.severity) || b.logged_on.localeCompare(a.logged_on))
      return { total: rows.length, tickets: rows.slice(0, f.limit ?? 25).map((t) => ticketBrief(ctx, t)) }
    }),
  def('count_tickets', 'Counting tickets',
    'Count tickets matching filters, grouped by one field. Use for "how many" questions and breakdowns.',
    TicketFilters.extend({ group_by: z.enum(['state', 'severity', 'owner', 'sprint', 'zone', 'page', 'kind']) }),
    (ctx, f) => {
      const rows = filterTickets(ctx, f)
      const key = (t: TicketRow) => f.group_by === 'owner' ? t.owner_name : f.group_by === 'sprint' ? (t.current_sprint_id ? ctx.sprintName.get(t.current_sprint_id) : null)
        : f.group_by === 'zone' ? t.zone : f.group_by === 'page' ? (t.zone ? `${t.zone} · ${t.page}` : null) : t[f.group_by]
      return { total: rows.length, by: countBy(rows, key) }
    }),
  def('get_ticket', 'Opening a ticket',
    'One ticket in full: description, history of moves, comments, and its test case steps.',
    z.object({ key: z.string().describe('Ticket key, e.g. DEV-TC_FN_074') }),
    async (ctx, { key }) => {
      const t = ctx.tickets.find((x) => x.key.toLowerCase() === key.toLowerCase())
      if (!t) return { error: `No ticket ${key}` }
      const supabase = await createClient()
      const [{ data: events }, { data: comments }, { data: tc }] = await Promise.all([
        supabase.from('ticket_events').select('from_state, to_state, note, at, people(name)').eq('ticket_id', t.id).order('at').limit(30),
        supabase.from('ticket_comments').select('body, created_at, people(name)').eq('ticket_id', t.id).order('created_at').limit(30),
        t.case_id ? supabase.from('test_cases').select('preconditions, steps, test_data, expected').eq('id', t.case_id).maybeSingle() : Promise.resolve({ data: null }),
      ])
      const who = (p: unknown) => (p as { name: string } | null)?.name ?? null
      return {
        ...ticketBrief(ctx, t), description: t.description, defer_reason: t.defer_reason,
        history: (events ?? []).map((e) => ({ at: e.at, from: e.from_state, to: e.to_state, note: e.note, by: who(e.people) })),
        comments: (comments ?? []).map((c) => ({ at: c.created_at, by: who(c.people), text: c.body })),
        test_case: tc,
      }
    }),
  def('search_test_cases', 'Looking up test cases',
    'Find test cases by any mix of filters. Returns up to `limit` cases and the total that match.',
    CaseFilters.extend({ limit: z.number().int().min(1).max(100).optional() }),
    (ctx, f) => {
      const rows = filterCases(ctx, f)
      return { total: rows.length, cases: rows.slice(0, f.limit ?? 25).map(caseBrief) }
    }),
  def('count_test_cases', 'Counting test cases',
    'Count test cases matching filters, grouped by one field. Use for coverage and progress questions.',
    CaseFilters.extend({ group_by: z.enum(['zone', 'page', 'priority', 'automation', 'tester', 'manual_result', 'auto_result']) }),
    (ctx, f) => {
      const rows = filterCases(ctx, f)
      const key = (c: CaseRow) => f.group_by === 'page' ? `${c.zone} · ${c.page}` : f.group_by === 'tester' ? c.tester_name : (c[f.group_by] as string | null)
      return { total: rows.length, by: countBy(rows, key) }
    }),
  def('get_test_case', 'Opening a test case',
    'One test case in full: steps, expected result, and its latest results.',
    z.object({ tc_id: z.string().describe('Test case ID, e.g. TC_FN_070') }),
    async (ctx, { tc_id }) => {
      const c = ctx.cases.find((x) => x.tc_id.toLowerCase() === tc_id.toLowerCase())
      if (!c) return { error: `No test case ${tc_id}` }
      const supabase = await createClient()
      const [{ data: detail }, { data: runs }] = await Promise.all([
        supabase.from('test_cases').select('preconditions, steps, test_data, expected, test_type').eq('id', c.id).maybeSingle(),
        supabase.from('test_runs').select('kind, result, recorded_at, note, build, people(name)').eq('case_id', c.id).order('recorded_at', { ascending: false }).limit(10),
      ])
      const tickets = ctx.tickets.filter((t) => t.case_id === c.id).map((t) => ({ key: t.key, state: t.state, owner: t.owner_name }))
      return {
        ...caseBrief(c), ...detail, tickets,
        results: (runs ?? []).map((r) => ({ kind: r.kind, result: r.result, at: r.recorded_at, note: r.note, build: r.build, by: (r.people as unknown as { name: string } | null)?.name ?? null })),
      }
    }),
  def('sprints', 'Checking sprints',
    'Every sprint: type (triage, test, fix, regression), dates, status, areas and open tickets. Test and fix sprints run side by side.',
    z.object({}),
    (ctx) => ctx.sprints.map((s) => {
      const areaIds = ctx.sprintAreas.filter((x) => x.sprint_id === s.id).map((x) => x.area_id)
      const names = ctx.areas.filter((a) => areaIds.includes(a.id)).map((a) => `${a.zone} · ${a.page}`)
      return {
        name: s.name, type: s.kind, status: s.status, starts: s.starts_on, ends: s.ends_on, goal: s.goal,
        areas: names.length > 12 ? `${names.length} areas` : names,
        cases: ctx.cases.filter((c) => areaIds.includes(c.area_id)).length,
        open_tickets: ctx.tickets.filter((t) => t.current_sprint_id === s.id && OPEN.includes(t.state)).length,
      }
    })),
  def('team', 'Checking the team',
    'Who is on the team and their role (lead, dev, qa), with how many open tickets each owns and cases each tests.',
    z.object({}),
    (ctx) => ctx.people.filter((p) => p.active).map((p) => ({
      name: p.name, role: p.role,
      open_tickets_owned: ctx.tickets.filter((t) => t.owner_id === p.id && OPEN.includes(t.state)).length,
      cases_testing: ctx.cases.filter((c) => c.tester_id === p.id).length,
    }))),
]

/** Runs one tool call: validates the input first (inputs stream in and may be cut off), then answers in JSON. */
export async function runTool(name: string, input: unknown, ctx: { value?: Ctx }): Promise<{ content: string; isError: boolean }> {
  const t = TOOLS.find((x) => x.tool.name === name)
  if (!t) return { content: `Unknown tool ${name}`, isError: true }
  const parsed = t.input.safeParse(input)
  if (!parsed.success) return { content: JSON.stringify({ INVALID_INPUT: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`) }), isError: true }
  try {
    ctx.value ??= await context()
    const out = await t.run(ctx.value, parsed.data as never)
    return { content: JSON.stringify(out), isError: false }
  } catch (e) {
    return { content: `The lookup failed: ${(e as Error).message}`, isError: true }
  }
}

export const toolLabel = (name: string) => TOOLS.find((t) => t.tool.name === name)?.label ?? 'Looking things up'
