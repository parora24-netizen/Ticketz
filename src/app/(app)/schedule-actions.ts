'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getMe } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { loadCases, loadHolidays, loadRelease, loadSprintRuns, loadSprints, loadTickets, toStageInput } from '@/lib/data'
import { planExtension } from '@/lib/schedule'
import { caseStage } from '@/lib/workflow/case-stage'
import { gateFor } from '@/lib/workflow/sprint-gate'

// Spillover: extend a sprint, or finish it and decide where the leftovers go. Every change is
// written to schedule_changes with who, what and why.

type Supa = Awaited<ReturnType<typeof createClient>>
type Kind = 'extend_sprint' | 'shift_release' | 'spill_over' | 'move_tickets' | 'close_sprint'

async function logChange(supabase: Supa, actorId: string, row: { kind: Kind; sprint_id?: string | null; summary: string; reason?: string | null; details?: Record<string, unknown> }) {
  await supabase.from('schedule_changes').insert({ ...row, reason: row.reason || null, details: row.details ?? {}, actor_id: actorId })
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** Add working days to a sprint; optionally shift every later sprint, and the release if needed. */
export async function extendSprint(input: { sprint_id: string; days: number; cascade: boolean; reason: string }): Promise<{ error?: string; summary?: string }> {
  const me = await getMe()
  if (me.role !== 'lead') return { error: 'Only the lead changes the schedule' }
  const v = z.object({ sprint_id: z.uuid(), days: z.number().int().min(1).max(15), cascade: z.boolean(), reason: z.string().trim().min(3).max(500) }).safeParse(input)
  if (!v.success) return { error: 'Give the number of working days (1 to 15) and a reason' }
  const supabase = await createClient()
  const [sprints, release, holidays] = await Promise.all([loadSprints(), loadRelease(), loadHolidays()])
  const s = sprints.find((x) => x.id === v.data.sprint_id)
  if (!s || s.status === 'closed') return { error: 'Only a planned or running sprint can be extended' }
  const plan = planExtension(sprints, s.id, v.data.days, v.data.cascade, release, new Set(holidays.map((h) => h.day)))
  // Latest sprint first, so dates never overlap mid-update.
  for (const c of [...plan.sprints].sort((a, b) => b.starts_on.localeCompare(a.starts_on))) {
    const { error } = await supabase.from('sprints').update({ starts_on: c.starts_on, ends_on: c.ends_on }).eq('id', c.id)
    if (error) return { error: error.message }
  }
  const moved = plan.release.release_on !== release.release_on
  if (moved) {
    const { error } = await supabase.from('release_settings').update({ ...plan.release, updated_at: new Date().toISOString() }).eq('id', 1)
    if (error) return { error: error.message }
  }
  const later = plan.sprints.slice(1).map((x) => x.name)
  const summary = `${s.name} extended ${plural(v.data.days, 'working day')} to ${plan.sprints[0].ends_on}`
    + (later.length ? `; ${later[0]}${later.length > 1 ? ` to ${later.at(-1)}` : ''} shifted` : '')
    + (moved ? `; release moved ${release.release_on} to ${plan.release.release_on}` : '')
  await logChange(supabase, me.id, {
    kind: 'extend_sprint', sprint_id: s.id, summary, reason: v.data.reason,
    details: { days: v.data.days, cascade: v.data.cascade, sprints: plan.sprints, release_before: release, release_after: plan.release },
  })
  revalidatePath('/', 'layout')
  return { summary }
}

/**
 * Finish a sprint. With the gate met this is a plain close. Without it, the lead says why and
 * chooses where the leftovers go: chosen tickets to a later sprint (the rest to no sprint, for
 * triage), and optionally the unfinished areas added to that sprint to make the work up there.
 */
export async function finishSprint(input: { sprint_id: string; target_sprint_id: string | null; ticket_ids: string[]; add_areas: boolean; reason: string }): Promise<{ error?: string; summary?: string }> {
  const me = await getMe()
  if (me.role !== 'lead') return { error: 'Only the lead closes a sprint' }
  const v = z.object({
    sprint_id: z.uuid(), target_sprint_id: z.uuid().nullable(), ticket_ids: z.array(z.uuid()).max(2000), add_areas: z.boolean(), reason: z.string().trim().max(500),
  }).safeParse(input)
  if (!v.success) return { error: 'That close is not valid' }
  const supabase = await createClient()
  const sprints = await loadSprints()
  const sprint = sprints.find((s) => s.id === v.data.sprint_id)
  if (!sprint || sprint.status !== 'active') return { error: 'Only a running sprint can be closed' }
  const target = v.data.target_sprint_id ? sprints.find((s) => s.id === v.data.target_sprint_id) ?? null : null
  if (v.data.target_sprint_id && (!target || target.status === 'closed' || target.id === sprint.id)) return { error: 'Pick a later sprint that is not closed' }

  const { data: sa } = await supabase.from('sprint_areas').select('area_id').eq('sprint_id', sprint.id)
  const areaIds = (sa ?? []).map((r) => r.area_id as string)
  const [cases, runs, tickets] = await Promise.all([loadCases(areaIds), loadSprintRuns(sprint.id), loadTickets()])
  const scoped = tickets.filter((t) => t.current_sprint_id === sprint.id)
  const { data: taskRows } = await supabase.from('plan_tasks').select('id, num, status').eq('sprint_id', sprint.id)
  const sprintTasks = (taskRows ?? []) as { id: string; num: number; status: string }[]
  const emptyAreas = sprint.kind === 'test' ? areaIds.filter((a) => !cases.some((c) => c.area_id === a)).length : 0
  const gate = gateFor(sprint.kind, { cases: cases.map((c) => toStageInput(c, runs)), tickets: scoped, tasks: sprintTasks, emptyAreas })
  if (!gate.ok && v.data.reason.length < 3) return { error: 'The gate is not met. Say why the sprint is closing anyway.' }

  const open = scoped.filter((t) => !['closed', 'deferred', 'duplicate'].includes(t.state))
  const moving = open.filter((t) => v.data.ticket_ids.includes(t.id))
  const parked = open.filter((t) => !v.data.ticket_ids.includes(t.id))
  if (moving.length) {
    if (!target) return { error: 'Pick the sprint the tickets move to' }
    const { error } = await supabase.from('tickets').update({ current_sprint_id: target.id }).in('id', moving.map((t) => t.id))
    if (error) return { error: error.message }
  }
  if (parked.length) {
    const { error } = await supabase.from('tickets').update({ current_sprint_id: null }).in('id', parked.map((t) => t.id))
    if (error) return { error: error.message }
  }
  // Unfinished plan tasks go with the tickets to the next sprint, or back to the plan.
  const openTasks = sprintTasks.filter((t) => t.status !== 'done')
  if (openTasks.length) {
    const { error } = await supabase.from('plan_tasks').update({ sprint_id: target?.id ?? null }).in('id', openTasks.map((t) => t.id))
    if (error) return { error: error.message }
  }
  let addedAreas: string[] = []
  if (v.data.add_areas && target) {
    const unfinished = new Set(cases.filter((c) => caseStage(toStageInput(c, runs)) !== 'done').map((c) => c.area_id))
    const { data: have } = await supabase.from('sprint_areas').select('area_id').eq('sprint_id', target.id)
    const already = new Set((have ?? []).map((r) => r.area_id as string))
    addedAreas = [...unfinished].filter((a) => !already.has(a))
    if (addedAreas.length) {
      const { error } = await supabase.from('sprint_areas').insert(addedAreas.map((area_id) => ({ sprint_id: target.id, area_id })))
      if (error) return { error: error.message }
    }
  }
  const { error } = await supabase.from('sprints').update({ status: 'closed', closed_at: new Date().toISOString() }).eq('id', sprint.id)
  if (error) return { error: error.message }

  const parts = [`${sprint.name} closed${gate.ok ? '' : ' with the gate not met'}`]
  if (moving.length) parts.push(`${plural(moving.length, 'ticket')} moved to ${target!.name}`)
  if (parked.length) parts.push(`${plural(parked.length, 'ticket')} left without a sprint`)
  if (openTasks.length) parts.push(`${plural(openTasks.length, 'open task')} ${target ? `moved to ${target.name}` : 'back on the plan'}`)
  if (addedAreas.length) parts.push(`${plural(addedAreas.length, 'unfinished area')} added to ${target!.name}`)
  const summary = parts.join('; ')
  await logChange(supabase, me.id, {
    kind: gate.ok ? 'close_sprint' : 'spill_over', sprint_id: sprint.id, summary, reason: v.data.reason,
    details: { tasks: openTasks.map((t) => t.num), moved: moving.map((t) => t.key), parked: parked.map((t) => t.key), target: target?.name ?? null, added_areas: addedAreas, gate: gate.checks },
  })
  revalidatePath('/', 'layout')
  return { summary }
}

/** Move the release dates by hand, for a decision to slip or pull in. Logged. */
export async function setReleaseDates(input: { release_on: string; go_no_go_on: string; reason: string }): Promise<{ error?: string }> {
  const me = await getMe()
  if (me.role !== 'lead') return { error: 'Only the lead changes the release date' }
  const v = z.object({ release_on: z.iso.date(), go_no_go_on: z.iso.date(), reason: z.string().trim().min(3).max(500) }).safeParse(input)
  if (!v.success) return { error: 'Give both dates and a reason' }
  if (v.data.go_no_go_on > v.data.release_on) return { error: 'Go/no-go comes before the release' }
  const supabase = await createClient()
  const before = await loadRelease()
  const { error } = await supabase.from('release_settings').update({ release_on: v.data.release_on, go_no_go_on: v.data.go_no_go_on, updated_at: new Date().toISOString() }).eq('id', 1)
  if (error) return { error: error.message }
  await logChange(supabase, me.id, {
    kind: 'shift_release', summary: `Release moved ${before.release_on} to ${v.data.release_on} (go/no-go ${v.data.go_no_go_on})`, reason: v.data.reason,
    details: { before, after: v.data },
  })
  revalidatePath('/', 'layout')
  return {}
}
