import 'server-only'
import type Anthropic from '@anthropic-ai/sdk'
import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { updateTickets } from '@/app/(app)/actions'
import { movePagesToSprint } from '@/app/(app)/release/plan/actions'
import { resolvePages, resolvePerson, resolveSprint } from '@/lib/assistant/resolve'
import { TicketFilters, filterTickets, loadToolContext, toolSchema, type ToolContext } from '@/lib/assistant/tools'
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
