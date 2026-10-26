'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getMe } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { loadAreas, loadCases, loadSprints, loadTickets } from '@/lib/data'

const Input = z.object({
  changes: z.array(z.object({ area_id: z.uuid(), sprint_id: z.uuid().nullable() })).max(500),
  dates: z.array(z.object({ sprint_id: z.uuid(), starts_on: z.iso.date(), ends_on: z.iso.date() })).max(50).default([]),
  route_tickets: z.boolean(),
}).refine((x) => x.changes.length + x.dates.length > 0)

/**
 * Edit plan: which test sprint tests each page. Only test sprints that have not closed change;
 * closed sprints keep their history and regression keeps every area. With `route_tickets`, the
 * Medium and Low tickets on a moved page follow it to the fix sprint after its new test sprint
 * (T3 -> F4), as the plan routes them.
 */
export async function savePlan(input: z.infer<typeof Input>): Promise<{ error?: string; summary?: string }> {
  const me = await getMe()
  if (me.role !== 'lead') return { error: 'Only the lead edits the plan' }
  const v = Input.safeParse(input)
  if (!v.success) return { error: 'Nothing valid to save' }

  const supabase = await createClient()
  const [sprints, areas] = await Promise.all([loadSprints(), loadAreas()])
  const openTests = sprints.filter((s) => s.kind === 'test' && s.status !== 'closed')
  const openTestIds = openTests.map((s) => s.id)
  if (v.data.changes.some((c) => c.sprint_id && !openTestIds.includes(c.sprint_id))) return { error: 'Pick a test sprint that has not closed' }

  // Sprint dates first: only sprints not yet closed, and never ending before they start.
  for (const d of v.data.dates) {
    const s = sprints.find((x) => x.id === d.sprint_id)
    if (!s || s.status === 'closed') return { error: 'Only sprints that have not closed can be re-dated' }
    if (d.ends_on < d.starts_on) return { error: `${s.name} would end before it starts` }
  }
  for (const d of v.data.dates) {
    const { error } = await supabase.from('sprints').update({ starts_on: d.starts_on, ends_on: d.ends_on }).eq('id', d.sprint_id)
    if (error) return { error: error.message }
  }

  const areaIds = v.data.changes.map((c) => c.area_id)
  if (areaIds.length) {
    const { error: delError } = await supabase.from('sprint_areas').delete().in('area_id', areaIds).in('sprint_id', openTestIds)
    if (delError) return { error: delError.message }
  }
  const rows = v.data.changes.filter((c) => c.sprint_id).map((c) => ({ sprint_id: c.sprint_id!, area_id: c.area_id }))
  if (rows.length) {
    const { error } = await supabase.from('sprint_areas').insert(rows)
    if (error) return { error: error.message }
  }

  let routed = 0
  if (v.data.route_tickets) {
    const [cases, tickets] = await Promise.all([loadCases(areaIds), loadTickets()])
    const areaOfCase = new Map(cases.map((c) => [c.id, c.area_id]))
    const byName = new Map(sprints.map((s) => [s.name, s]))
    const target = new Map<string, string>() // area -> fix sprint id
    for (const c of v.data.changes) {
      const test = sprints.find((s) => s.id === c.sprint_id)
      const n = test ? Number(test.name.slice(1)) : NaN
      const fix = Number.isFinite(n) ? byName.get(`F${n + 1}`) : undefined
      if (fix && fix.status !== 'closed') target.set(c.area_id, fix.id)
    }
    const planned = new Set(sprints.filter((s) => s.status === 'planned').map((s) => s.id))
    const moves = new Map<string, string[]>() // fix sprint -> ticket ids
    for (const t of tickets) {
      const area = t.case_id ? areaOfCase.get(t.case_id) : undefined
      const to = area ? target.get(area) : undefined
      if (!to || ['Critical', 'High'].includes(t.severity) || ['closed', 'deferred', 'duplicate'].includes(t.state)) continue
      if (t.current_sprint_id === to || (t.current_sprint_id && !planned.has(t.current_sprint_id))) continue // leave running work alone
      moves.set(to, [...(moves.get(to) ?? []), t.id])
    }
    for (const [to, ids] of moves) {
      const { error } = await supabase.from('tickets').update({ current_sprint_id: to }).in('id', ids)
      if (error) return { error: error.message }
      routed += ids.length
    }
  }

  const label = (id: string) => { const a = areas.find((x) => x.id === id); return a ? `${a.zone} · ${a.page}` : 'an area' }
  const sprintName = (id: string | null) => (id ? sprints.find((s) => s.id === id)?.name ?? '?' : 'not planned')
  const fmt = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
  const lines = [
    ...v.data.dates.map((d) => `${sprintName(d.sprint_id)} ${fmt(d.starts_on)}–${fmt(d.ends_on)}`),
    ...v.data.changes.map((c) => `${label(c.area_id)} → ${sprintName(c.sprint_id)}`),
  ]
  const parts = [
    v.data.dates.length && `${v.data.dates.length} sprint${v.data.dates.length === 1 ? '' : 's'} re-dated`,
    v.data.changes.length && `${v.data.changes.length} page${v.data.changes.length === 1 ? '' : 's'} moved`,
    routed && `${routed} Medium/Low tickets followed`,
  ].filter(Boolean)
  const summary = `Plan edited: ${parts.join(', ')}`
  await supabase.from('schedule_changes').insert({
    kind: 'move_tickets', sprint_id: null, summary: `${summary}. ${lines.slice(0, 12).join('; ')}${lines.length > 12 ? '; …' : ''}`,
    reason: null, details: { changes: v.data.changes, dates: v.data.dates, routed }, actor_id: me.id,
  })
  revalidatePath('/', 'layout')
  return { summary }
}
