import 'server-only'
import type Anthropic from '@anthropic-ai/sdk'
import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { recordCaseResult, retireCases, updateTickets } from '@/app/(app)/actions'
import { movePagesToSprint } from '@/app/(app)/release/plan/actions'
import { resolvePages, resolvePerson, resolveSprint } from '@/lib/assistant/resolve'
import { CaseFilters, TicketFilters, filterCases, filterTickets, loadToolContext, toolSchema, type ToolContext } from '@/lib/assistant/tools'
import type { getMe } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { ticketsFollowing } from '@/lib/workflow/fix-sprint'
import { OPEN_STATES } from '@/lib/workflow/ticket-machine'

/**
 * What the assistant can change. It never changes anything itself: it reads a direction, fills in
 * one of these, and the person sees exactly what would happen and clicks Confirm. Confirming works
 * the plan out afresh as that person, and refuses if the result has changed since they saw it.
 *
 * To teach it something new, add an entry: its input says what a direction must pin down, and
 * `prepare` resolves that into the change, or an error to ask about, using the app's own actions.
 */
type Me = Awaited<ReturnType<typeof getMe>>
type Prepared = { error: string } | { title: string; lines: string[]; note?: string; fingerprint: string; run: () => Promise<{ error?: string; done?: string }> }
type ActionDef = { name: string; label: string; description: string; input: z.ZodType; prepare: (ctx: ToolContext, me: Me, input: never) => Promise<Prepared> | Prepared }

export type Proposal = { id: string; action: string; input: unknown; fingerprint: string; title: string; lines: string[]; note?: string }

const MAX_TICKETS = 200
const some = (items: string[], most = 8) => items.slice(0, most).join(', ') + (items.length > most ? ` and ${items.length - most} more` : '')
const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`

function action<S extends z.ZodType>(name: string, label: string, description: string, input: S, prepare: (ctx: ToolContext, me: Me, input: z.infer<S>) => Promise<Prepared> | Prepared): ActionDef {
  return { name, label, description, input, prepare: prepare as ActionDef['prepare'] }
}

/** The tickets a direction means: named ones, or those matching its filters (only open ones unless it says otherwise). */
function chooseTickets(ctx: ToolContext, f: z.infer<typeof TicketSelection>) {
  const { keys, ...filters } = f
  if (keys?.length) {
    const wanted = keys.map((k) => k.trim().toLowerCase())
    const found = ctx.tickets.filter((t) => wanted.includes(t.key.toLowerCase()) || wanted.includes(t.legacy_key?.toLowerCase() ?? ''))
    const missing = keys.filter((k) => !found.some((t) => t.key.toLowerCase() === k.trim().toLowerCase() || t.legacy_key?.toLowerCase() === k.trim().toLowerCase()))
    return missing.length ? { error: `No ticket ${some(missing)}.` } : { tickets: found }
  }
  const narrowed = Object.values(filters).some((v) => v !== undefined && v !== false)
  if (!narrowed) return { error: 'Which tickets?' }
  return { tickets: filterTickets(ctx, { ...filters, open_only: filters.open_only ?? !filters.states?.length }) }
}
const TicketSelection = TicketFilters.extend({ keys: z.array(z.string()).max(MAX_TICKETS).optional().describe('Exact ticket keys, when the direction names them') })

const MAX_CASES = 100
const AUTOMATION: Record<string, string> = { manual_only: 'not automatable (retired)', not_automated: 'not automated', in_progress: 'automation in progress', automated: 'automated', blocked: 'automation blocked' }
const CaseSelection = CaseFilters.extend({ tc_ids: z.array(z.string()).max(MAX_CASES).optional().describe('Exact case IDs, e.g. TC_503, when the direction names them') })

/** The cases a direction means: named ones, or those matching its filters. */
function chooseCases(ctx: ToolContext, f: z.infer<typeof CaseSelection>): { error: string; cases?: undefined } | { error?: undefined; cases: ToolContext['cases'] } {
  const { tc_ids, ...filters } = f
  if (tc_ids?.length) {
    const norm = (s: string) => s.trim().toLowerCase().replace(/^tc[-_ ]?/, 'tc_')
    const wanted = tc_ids.map(norm)
    const found = ctx.cases.filter((c) => wanted.includes(c.tc_id.toLowerCase()) || wanted.includes((c.legacy_tc_id ?? '').toLowerCase()))
    const missing = tc_ids.filter((k) => !found.some((c) => c.tc_id.toLowerCase() === norm(k) || (c.legacy_tc_id ?? '').toLowerCase() === norm(k)))
    return missing.length ? { error: `No test case ${some(missing)}.` } : { cases: found }
  }
  if (!Object.values(filters).some((v) => v !== undefined)) return { error: 'Which test cases?' }
  const cases = filterCases(ctx, filters)
  return cases.length ? { cases } : { error: 'No test cases match that.' }
}

export const ACTIONS: ActionDef[] = [
  action('propose_move_pages', 'Preparing the move',
    'Put pages in a sprint: "move all of Data Exporter to sprint 4", "My Flow and Landing go to S3", "take Create out of the sprints". Their open tickets follow, except those in the running sprint. Lead only.',
    z.object({
      zones: z.array(z.string()).optional().describe('Whole zones to move'),
      pages: z.array(z.string()).optional().describe('Single pages, as "Create" or "My Flow · Create"'),
      sprint: z.string().describe('The sprint as they said it, e.g. "sprint 4" or "S4", or "none" to take the pages out of the sprints'),
    }),
    (ctx, me, input) => {
      if (me.role !== 'lead') return { error: 'Only the lead can move pages between sprints.' }
      const inRelease = ctx.areas.filter((a) => a.in_release !== false)
      const pages = resolvePages(input, inRelease)
      if (pages.error !== undefined) return { error: pages.error }
      const open = ctx.sprints.filter((s) => (s.kind === 'fix' || s.kind === 'triage') && s.status !== 'closed')
      const sprint = resolveSprint(input.sprint, open)
      if (sprint.error !== undefined) return { error: `${sprint.error} Pages go in fix sprints that have not closed; regression already covers every page.` }
      const to = sprint.value
      const inSprint = (id: string) => ctx.sprintAreas.some((x) => x.area_id === id && open.some((s) => s.id === x.sprint_id && (to ? s.id === to.id : true)))
      const moving = pages.value.filter((a) => (to ? !inSprint(a.id) : inSprint(a.id)))
      if (!moving.length) return { error: to ? `${some(pages.value.map((a) => a.page))} ${pages.value.length === 1 ? 'is' : 'are'} already in ${to.name}.` : 'Those pages are not in a sprint.' }
      const ids = moving.map((a) => a.id)
      const following = to ? ticketsFollowing(ctx.tickets.filter((t) => OPEN_STATES.includes(t.state)), ids, to.id, ctx.sprints) : []
      const staying = ctx.tickets.filter((t) => OPEN_STATES.includes(t.state) && t.current_sprint_id !== to?.id && !!t.area_id && ids.includes(t.area_id)).length - following.length
      const zones = [...new Set(moving.map((a) => a.zone))]
      const whole = zones.every((z) => moving.filter((a) => a.zone === z).length === inRelease.filter((a) => a.zone === z).length)
      const what = whole ? `all of ${zones.join(' and ')}` : some(moving.map((a) => a.page), 4)
      return {
        title: to ? `Move ${what} to ${to.name}` : `Take ${what} out of the sprints`,
        lines: [
          `${plural(moving.length, 'page')}: ${some(moving.map((a) => a.page))}`,
          to ? `${plural(following.length, 'open ticket')} will follow` : 'Their open tickets stay where they are',
          ...(to && staying ? [`${staying} in the running sprint will stay`] : []),
        ],
        fingerprint: JSON.stringify([ids.toSorted(), to?.id ?? null, following.map((t) => t.id).toSorted()]),
        run: async () => {
          const res = await movePagesToSprint(ids, to?.id ?? null)
          return res.error ? { error: res.error } : { done: to ? `Moved ${what} to ${to.name}; ${plural(following.length, 'open ticket')} followed.` : `Took ${what} out of the sprints.` }
        },
      }
    }),

  action('propose_reassign_tickets', 'Preparing the handover',
    'Change who owns tickets: "give Niten\'s open My Flow tickets to Uday", "assign DEV-123 to me", "unassign the Low tickets on Engine". By key or by filters.',
    TicketSelection.extend({ to: z.string().describe('The new owner as they said it, "me", or "none" to unassign') }),
    (ctx, me, { to: who, ...selection }) => {
      const person = resolvePerson(who, ctx.people.filter((p) => p.active), me.id)
      if (person.error !== undefined) return { error: person.error }
      const chosen = chooseTickets(ctx, selection)
      if (chosen.error !== undefined) return { error: chosen.error }
      const to = person.value
      const moving = chosen.tickets.filter((t) => t.owner_id !== (to?.id ?? null))
      if (!moving.length) return { error: chosen.tickets.length ? `Those tickets are already with ${to?.name ?? 'no one'}.` : 'No tickets match that.' }
      if (moving.length > MAX_TICKETS) return { error: `That is ${moving.length} tickets; ${MAX_TICKETS} at most at a time. Narrow it down.` }
      const owners = [...new Set(moving.map((t) => t.owner_name ?? 'Unassigned'))]
      const ids = moving.map((t) => t.id)
      return {
        title: to ? `Give ${plural(moving.length, 'ticket')} to ${to.name}` : `Unassign ${plural(moving.length, 'ticket')}`,
        lines: [some(moving.map((t) => t.key)), `Now with: ${some(owners, 5)}`],
        note: to ? `${to.name} will be notified.` : undefined,
        fingerprint: JSON.stringify([ids.toSorted(), to?.id ?? null]),
        run: async () => {
          const res = await updateTickets(ids, { owner_id: to?.id ?? null })
          return res.error ? { error: res.error } : { done: to ? `Gave ${plural(ids.length, 'ticket')} to ${to.name}.` : `Unassigned ${plural(ids.length, 'ticket')}.` }
        },
      }
    }),

  action('propose_comment', 'Preparing the comment',
    'Add a comment to tickets, in the name of the person asking: "tell Niten on DEV-123 that the fix is in build 39". @Name notifies that person.',
    z.object({ keys: z.array(z.string()).min(1).max(20).describe('Ticket keys'), body: z.string().trim().min(1).max(5000).describe('The comment, in their words. Write @Name to notify someone.') }),
    (ctx, me, { keys, body }) => {
      const chosen = chooseTickets(ctx, { keys })
      if (chosen.error !== undefined) return { error: chosen.error }
      const ids = chosen.tickets.map((t) => t.id)
      return {
        title: `Comment on ${some(chosen.tickets.map((t) => t.key), 3)}`,
        lines: [body],
        note: `Posted as ${me.name}.`,
        fingerprint: JSON.stringify([ids.toSorted(), body]),
        run: async () => {
          const supabase = await createClient()
          const { error } = await supabase.from('ticket_comments').insert(ids.map((ticket_id) => ({ ticket_id, body, author_id: me.id })))
          if (error) return { error: error.message }
          revalidatePath('/', 'layout')
          return { done: `Commented on ${some(chosen.tickets.map((t) => t.key), 3)}.` }
        },
      }
    }),

  action('propose_record_results', 'Preparing the results',
    'Record a manual test result on test cases: "pass TC_503, TC_504 and TC_505, security questions are removed", "fail TC_12 on build 41", "mark the Data Exporter cases blocked, no server". A failure raises (or reopens) the case\'s ticket, as the board does. Lead and QA only.',
    CaseSelection.extend({
      result: z.enum(['passed', 'failed', 'blocked']),
      note: z.string().trim().max(2000).optional().describe('Why, in their words; recorded with each result'),
      build: z.string().trim().max(100).optional(),
    }),
    (ctx, me, { result, note, build, ...selection }) => {
      if (me.role === 'dev') return { error: 'Only QA or the lead record results.' }
      const chosen = chooseCases(ctx, selection)
      if (chosen.error !== undefined) return { error: chosen.error }
      const cases = chosen.cases
      if (cases.length > MAX_CASES) return { error: `That is ${cases.length} cases; ${MAX_CASES} at most at a time. Narrow it down.` }
      const ids = cases.map((c) => c.id)
      const word = result === 'passed' ? 'Pass' : result === 'failed' ? 'Fail' : 'Block'
      return {
        title: `${word} ${plural(cases.length, 'case')}`,
        lines: [some(cases.map((c) => `${c.tc_id} ${c.title}`), 6), ...(note ? [`Note: ${note}`] : []), ...(build ? [`Build ${build}`] : [])],
        note: `Recorded as ${me.name}'s manual result${result === 'failed' ? '; each failure raises or reopens its ticket' : ''}.`,
        fingerprint: JSON.stringify([ids.toSorted(), result, note ?? null, build ?? null]),
        run: async () => {
          const failed: string[] = []
          const tickets: string[] = []
          for (const c of cases) {
            const res = await recordCaseResult({ case_id: c.id, result, note, build, raise_ticket: result === 'failed' })
            if (res.error) failed.push(`${c.tc_id} (${res.error})`)
            if (res.ticketKey) tickets.push(res.ticketKey)
          }
          const ok = cases.length - failed.length
          const done = `${word === 'Block' ? 'Blocked' : word === 'Pass' ? 'Passed' : 'Failed'} ${plural(ok, 'case')}${tickets.length ? `; tickets ${some(tickets)}` : ''}.`
          return failed.length ? { error: `${done} Not recorded: ${some(failed, 4)}` } : { done }
        },
      }
    }),

  action('propose_set_automation', 'Preparing the change',
    'Set test cases\' automation status: "these can\'t be automated" means manual_only (still tested by hand); also automated, in_progress, blocked, not_automated. To take cases out of the release altogether ("retire"), use propose_retire_cases instead. Lead and QA only.',
    CaseSelection.extend({
      automation: z.enum(['manual_only', 'not_automated', 'in_progress', 'automated', 'blocked']).describe('manual_only = tested by hand only'),
      reason: z.string().trim().max(2000).optional().describe('Why, in their words'),
    }),
    (ctx, me, { automation, reason, ...selection }) => {
      if (me.role === 'dev') return { error: 'Only QA or the lead change test cases.' }
      const chosen = chooseCases(ctx, selection)
      if (chosen.error !== undefined) return { error: chosen.error }
      const cases = chosen.cases.filter((c) => c.automation !== automation)
      if (!cases.length) return { error: `Those cases are already ${AUTOMATION[automation]}.` }
      if (cases.length > MAX_CASES) return { error: `That is ${cases.length} cases; ${MAX_CASES} at most at a time. Narrow it down.` }
      const ids = cases.map((c) => c.id)
      return {
        title: `Set ${plural(cases.length, 'case')} to ${AUTOMATION[automation]}`,
        lines: [some(cases.map((c) => `${c.tc_id} ${c.title}`), 6), `Now: ${some([...new Set(cases.map((c) => AUTOMATION[c.automation] ?? c.automation))], 4)}`, ...(reason ? [`Reason: ${reason}`] : [])],
        fingerprint: JSON.stringify([ids.toSorted(), automation, reason ?? null]),
        run: async () => {
          const supabase = await createClient()
          const now = new Date().toISOString()
          const { error } = await supabase.from('test_cases').update({
            automation, updated_at: now,
            ...(automation === 'manual_only' ? { automation_proposed: null, automation_decided_by: me.id, automation_decided_at: now, automation_note: (reason ? `Manual only, set by ${me.name}: ${reason}` : `Manual only, set by ${me.name}`).slice(0, 2000) } : {}),
          }).in('id', ids)
          if (error) return { error: error.message }
          revalidatePath('/', 'layout')
          return { done: `Set ${plural(ids.length, 'case')} to ${AUTOMATION[automation]}.` }
        },
      }
    }),

  action('propose_retire_cases', 'Preparing the change',
    'Retire test cases, or restore retired ones: "retire TC_474, TC_504 and TC_506, security questions are gone", "restore TC_504". A retired case keeps its text and history but leaves every list, board and count, and the runner stops running it. Retiring needs a reason. Lead and QA only.',
    CaseSelection.extend({
      restore: z.boolean().optional().describe('true to bring retired cases back'),
      reason: z.string().trim().max(2000).optional().describe('Why they are retired, in their words'),
    }),
    async (ctx, me, { restore, reason, ...selection }) => {
      if (me.role === 'dev') return { error: 'Only QA or the lead retire test cases.' }
      let cases: { id: string; tc_id: string; title: string }[]
      if (restore) {
        // Retired cases are not in the lists Sidekick reads, so look them up by ID.
        if (!selection.tc_ids?.length) return { error: 'Which retired cases? Name them by ID.' }
        const supabase = await createClient()
        const wanted = selection.tc_ids.map((k) => k.trim().toUpperCase().replace(/^TC[-_ ]?/, 'TC_'))
        const { data } = await supabase.from('test_cases').select('id, tc_id, title').in('tc_id', wanted).not('retired_at', 'is', null)
        cases = data ?? []
        const missing = wanted.filter((k) => !cases.some((c) => c.tc_id === k))
        if (missing.length) return { error: `${some(missing)} ${missing.length === 1 ? 'is' : 'are'} not retired, or not a case.` }
      } else {
        if (!reason || reason.length < 3) return { error: 'Why are they being retired?' }
        const chosen = chooseCases(ctx, selection)
        if (chosen.error !== undefined) return { error: chosen.error }
        cases = chosen.cases
      }
      if (cases.length > MAX_CASES) return { error: `That is ${cases.length} cases; ${MAX_CASES} at most at a time. Narrow it down.` }
      const ids = cases.map((c) => c.id)
      return {
        title: `${restore ? 'Restore' : 'Retire'} ${plural(cases.length, 'case')}`,
        lines: [some(cases.map((c) => `${c.tc_id} ${c.title}`), 6), ...(restore ? ['They come back into every list, board and count.'] : [`Reason: ${reason}`])],
        note: restore ? undefined : 'Kept with their history; restore them any time from their page or here.',
        fingerprint: JSON.stringify([ids.toSorted(), !!restore, reason ?? null]),
        run: async () => {
          const res = await retireCases(ids, restore ? null : reason!)
          return res.error ? { error: res.error } : { done: `${restore ? 'Restored' : 'Retired'} ${some(cases.map((c) => c.tc_id))}.` }
        },
      }
    }),

  action('propose_edit_case', 'Preparing the edit',
    'Change one test case\'s text: title, preconditions, steps, test data or expected result. "TC_479 should no longer expect a Security questions panel". Write the full new text of each field that changes. Lead and QA only.',
    z.object({
      tc_id: z.string().describe('The case, e.g. TC_479'),
      title: z.string().trim().min(3).max(300).optional(),
      preconditions: z.string().trim().max(5000).optional(),
      steps: z.string().trim().max(10000).optional(),
      test_data: z.string().trim().max(5000).optional(),
      expected: z.string().trim().max(5000).optional(),
    }),
    async (ctx, me, { tc_id, ...fields }) => {
      if (me.role === 'dev') return { error: 'Only QA or the lead change test cases.' }
      const c = ctx.cases.find((x) => x.tc_id.toLowerCase() === tc_id.trim().toLowerCase() || x.legacy_tc_id?.toLowerCase() === tc_id.trim().toLowerCase())
      if (!c) return { error: `No test case ${tc_id}.` }
      const supabase = await createClient()
      const { data: now } = await supabase.from('test_cases').select('title, preconditions, steps, test_data, expected').eq('id', c.id).single()
      if (!now) return { error: `No test case ${tc_id}.` }
      const changes = (Object.entries(fields) as [keyof typeof now, string | undefined][]).filter(([k, v]) => v !== undefined && v !== (now[k] ?? ''))
      if (!changes.length) return { error: `That is what ${c.tc_id} already says.` }
      const LABEL: Record<string, string> = { title: 'Title', preconditions: 'Preconditions', steps: 'Steps', test_data: 'Test data', expected: 'Expected' }
      return {
        title: `Edit ${c.tc_id}`,
        lines: changes.flatMap(([k, v]) => [`${LABEL[k]} was: ${now[k] || '(empty)'}`, `${LABEL[k]} becomes: ${v}`]),
        note: 'The automation runner sees the text changed.',
        fingerprint: JSON.stringify([c.id, changes, changes.map(([k]) => now[k])]),
        run: async () => {
          const { error } = await supabase.from('test_cases').update({ ...Object.fromEntries(changes), updated_at: new Date().toISOString() }).eq('id', c.id)
          if (error) return { error: error.message }
          revalidatePath('/', 'layout')
          return { done: `Updated ${c.tc_id}.` }
        },
      }
    }),
]

export const ACTION_TOOLS: Anthropic.Beta.BetaTool[] = ACTIONS.map((a) => ({ name: a.name, description: a.description, input_schema: toolSchema(a.input), eager_input_streaming: true }))
export const isAction = (name: string) => ACTIONS.some((a) => a.name === name)
export const actionLabel = (name: string) => ACTIONS.find((a) => a.name === name)?.label

async function prepare(name: string, input: unknown, ctx: ToolContext, me: Me): Promise<Prepared> {
  const a = ACTIONS.find((x) => x.name === name)
  if (!a) return { error: 'I cannot do that.' }
  const parsed = a.input.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') }
  return a.prepare(ctx, me, parsed.data as never)
}

/** A direction as a proposal for the person to confirm, or what to ask them instead. */
export async function propose(name: string, input: unknown, ctx: ToolContext, me: Me): Promise<{ proposal?: Proposal; error?: string }> {
  const p = await prepare(name, input, ctx, me)
  if ('error' in p) return { error: p.error }
  return { proposal: { id: randomUUID(), action: name, input, fingerprint: p.fingerprint, title: p.title, lines: p.lines, note: p.note } }
}

/** The person confirmed: work it out afresh as them, and go ahead only if it is still what they saw. */
export async function applyProposal(name: string, input: unknown, fingerprint: string, me: Me): Promise<{ error?: string; done?: string }> {
  const p = await prepare(name, input, await loadToolContext(), me)
  if ('error' in p) return { error: p.error }
  if (p.fingerprint !== fingerprint) return { error: 'This has changed since it was proposed, so nothing was done. Ask again to see the new result.' }
  return p.run()
}
