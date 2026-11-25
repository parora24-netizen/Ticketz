'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getMe } from '@/lib/auth'
import { createClient, createServiceClient } from '@/lib/supabase/server'
import { CATEGORIES, planCleanup, type CleanCase, type CleanTicket, type CleanupPlan } from '@/lib/workflow/cleanup'

const OPEN = '(closed,deferred,duplicate)'
const mostCommon = (ids: (string | null)[]) => {
  const n = new Map<string, number>()
  for (const id of ids) if (id) n.set(id, (n.get(id) ?? 0) + 1)
  return [...n.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
}

/** The sprint's clean-up plan, and who it would hand things to unless told otherwise. */
async function plan(sprintId: string, choice: { automationOwner?: string | null; tester?: string | null }) {
  const db = await createClient()
  const { data: tickets } = await db.from('tickets').select('id, key, kind, owner_id, case_id').eq('current_sprint_id', sprintId).not('state', 'in', OPEN)
  const caseIds = [...new Set((tickets ?? []).map((t) => t.case_id as string | null).filter((c): c is string => !!c))]
  const [{ data: cases }, { data: mm }, { data: allMm }] = await Promise.all([
    caseIds.length ? db.from('case_latest').select('id, tc_id, tester_id, manual_result, manual_at, auto_result, auto_at').in('id', caseIds) : Promise.resolve({ data: [] }),
    caseIds.length ? db.from('tickets').select('id, key, case_id').eq('kind', 'test_mismatch').in('case_id', caseIds).not('state', 'in', OPEN) : Promise.resolve({ data: [] }),
    db.from('tickets').select('owner_id').eq('kind', 'test_mismatch').not('state', 'in', OPEN),
  ])
  const caseMap = new Map(((cases ?? []) as CleanCase[]).map((c) => [c.id, c]))
  // Defaults: whoever owns most open test issues fixes automation; whoever tests most of these cases tests the rest.
  const automationOwner = choice.automationOwner === undefined ? mostCommon((allMm ?? []).map((t) => t.owner_id as string | null)) : choice.automationOwner
  const tester = choice.tester === undefined ? mostCommon([...caseMap.values()].map((c) => c.tester_id)) : choice.tester
  const openMismatch = new Map<string, { id: string; key: string }>()
  for (const t of mm ?? []) if (!openMismatch.has(t.case_id as string)) openMismatch.set(t.case_id as string, { id: t.id as string, key: t.key as string })
  return { automationOwner, tester, plan: planCleanup({ tickets: (tickets ?? []) as CleanTicket[], cases: caseMap, openMismatch, automationOwner, tester }) }
}

const Choice = z.object({ sprint_id: z.uuid(), automation_owner: z.uuid().nullable().optional(), tester: z.uuid().nullable().optional(),
  /** The clean-ups to apply; all of them unless some are left out. */
  only: z.array(z.enum(CATEGORIES)).optional() })

/** What the clean-up would do, for the lead to check first. */
export async function previewCleanup(input: z.input<typeof Choice>): Promise<{ error?: string; automationOwner?: string | null; tester?: string | null; plan?: CleanupPlan }> {
  const me = await getMe()
  if (me.role !== 'lead') return { error: 'Only the lead cleans up a sprint' }
  const v = Choice.safeParse(input)
  if (!v.success) return { error: 'No such sprint' }
  return plan(v.data.sprint_id, { automationOwner: v.data.automation_owner, tester: v.data.tester })
}

/** Apply the clean-up: each change with a comment, recorded as the lead. */
export async function applyCleanup(input: z.input<typeof Choice>): Promise<{ error?: string; summary?: string }> {
  const me = await getMe()
  if (me.role !== 'lead') return { error: 'Only the lead cleans up a sprint' }
  const v = Choice.safeParse(input)
  if (!v.success) return { error: 'No such sprint' }
  const { automationOwner, tester, plan: full } = await plan(v.data.sprint_id, { automationOwner: v.data.automation_owner ?? null, tester: v.data.tester ?? null })
  const only = new Set(v.data.only ?? CATEGORIES)
  if (!only.size) return { error: 'Tick at least one clean-up' }
  // What is left out stays as it is.
  const p = Object.fromEntries(CATEGORIES.map((k) => [k, only.has(k) ? full[k] : []])) as CleanupPlan
  // Moves a lead could not make one by one (e.g. Reopened to Duplicate) go through the server key, as this person.
  const db = createServiceClient(me.id)
  const comment = (ticket_id: string, body: string) => db.from('ticket_comments').insert({ ticket_id, author_id: me.id, body })
  let done = 0
  for (const s of [...p.close, ...p.closeAuto]) { const { error } = await db.from('tickets').update({ state: 'closed' }).eq('id', s.ticket_id); if (!error) { await comment(s.ticket_id, s.note); done++ } }
  for (const s of p.duplicate) { const { error } = await db.from('tickets').update({ state: 'duplicate', duplicate_of: s.of_id }).eq('id', s.ticket_id); if (!error) { await comment(s.ticket_id, s.note); done++ } }
  if (automationOwner) for (const s of p.toAutomation) { const { error } = await db.from('tickets').update({ owner_id: automationOwner }).eq('id', s.ticket_id); if (!error) { await comment(s.ticket_id, s.note); done++ } }
  for (const s of p.toTester) { const { error } = await db.from('tickets').update({ owner_id: s.tester_id }).eq('id', s.ticket_id); if (!error) { await comment(s.ticket_id, s.note); done++ } }
  if (tester && p.tester.length) {
    const { error } = await db.from('test_cases').update({ tester_id: tester, updated_at: new Date().toISOString() }).in('id', p.tester.map((t) => t.case_id)).is('tester_id', null)
    if (!error) done += p.tester.length
  }
  revalidatePath('/', 'layout')
  return { summary: `${done} change${done === 1 ? '' : 's'} made: ${p.close.length + p.closeAuto.length} closed, ${p.duplicate.length} duplicates, ${p.toAutomation.length} to automation, ${p.toTester.length} to the tester, ${p.tester.length} cases given a tester` }
}
