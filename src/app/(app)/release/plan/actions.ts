'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getMe } from '@/lib/auth'
import { fmtDate, loadAreas, loadSprints, loadTickets } from '@/lib/data'
import { createClient } from '@/lib/supabase/server'
import { followsPage } from '@/lib/workflow/fix-sprint'
import { OPEN_STATES } from '@/lib/workflow/ticket-machine'

/** Sprints that fix pages and can still change; closed ones keep their history, regression keeps every page. */
const planned = (s: { kind: string; status: string }) => ['triage', 'test', 'fix'].includes(s.kind) && s.status !== 'closed'

/**
 * Puts pages in a sprint (or none), and their open tickets follow, except those in the running
 * sprint, so that no one's current work moves under them.
 */
export async function movePagesToSprint(pageIds: string[], sprintId: string | null): Promise<{ error?: string }> {
  const me = await getMe()
  if (me.role !== 'lead') return { error: 'Only the lead edits the plan' }
  const ids = z.array(z.uuid()).min(1).max(200).safeParse(pageIds)
  if (!ids.success || (sprintId !== null && !z.uuid().safeParse(sprintId).success)) return { error: 'That change was not understood' }
  const [sprints, areas, tickets] = await Promise.all([loadSprints(), loadAreas(), loadTickets()])
  const open = sprints.filter(planned)
  const to = sprintId ? open.find((s) => s.id === sprintId) : null
  if (sprintId && !to) return { error: 'Pick a sprint that has not closed' }

  const supabase = await createClient()
  const { error: delError } = await supabase.from('sprint_areas').delete().in('area_id', ids.data).in('sprint_id', open.map((s) => s.id))
  if (delError) return { error: delError.message }
  if (to) {
    const { error } = await supabase.from('sprint_areas').insert(ids.data.map((area_id) => ({ sprint_id: to.id, area_id })))
    if (error) return { error: error.message }
  }

  let moved = 0
  if (to) {
    const pages = new Set(ids.data)
    const following = tickets.filter((t) => OPEN_STATES.includes(t.state) && t.current_sprint_id !== to.id && followsPage(t, sprints) && !!t.area_id && pages.has(t.area_id))
    if (following.length) {
      const { error } = await supabase.from('tickets').update({ current_sprint_id: to.id }).in('id', following.map((t) => t.id))
      if (error) return { error: error.message }
      moved = following.length
    }
  }

  const names = ids.data.map((id) => { const a = areas.find((x) => x.id === id); return a ? `${a.zone} · ${a.page}` : 'a page' })
  await supabase.from('schedule_changes').insert({
    kind: 'move_tickets', sprint_id: to?.id ?? null, reason: null, actor_id: me.id, details: { pages: ids.data, sprint: to?.name ?? null, tickets: moved },
    summary: `${names.slice(0, 12).join(', ')}${names.length > 12 ? ', …' : ''} moved to ${to?.name ?? 'no sprint'}; ${moved} open ticket${moved === 1 ? '' : 's'} followed.`,
  })
  revalidatePath('/', 'layout')
  return {}
}

const SprintEdit = z.object({ sprint_id: z.uuid(), starts_on: z.iso.date(), ends_on: z.iso.date(), goal: z.string().trim().max(500), shift_later: z.boolean() })

/** A sprint's dates and goal. `shift_later` moves the open sprints after it by as many days as its end moved. */
export async function updateSprint(input: z.infer<typeof SprintEdit>): Promise<{ error?: string }> {
  const me = await getMe()
  if (me.role !== 'lead') return { error: 'Only the lead edits the plan' }
  const v = SprintEdit.safeParse(input)
  if (!v.success) return { error: 'A sprint needs start and end dates' }
  const { sprint_id, starts_on, ends_on, goal, shift_later } = v.data
  if (ends_on < starts_on) return { error: 'The sprint ends before it starts' }
  const sprints = await loadSprints()
  const s = sprints.find((x) => x.id === sprint_id)
  if (!s || s.status === 'closed') return { error: 'Only sprints that have not closed can be edited' }

  const supabase = await createClient()
  const { error } = await supabase.from('sprints').update({ starts_on, ends_on, goal: goal || null }).eq('id', s.id)
  if (error) return { error: error.message }

  const days = Math.round((Date.parse(ends_on) - Date.parse(s.ends_on)) / 864e5)
  const shift = (d: string) => new Date(Date.parse(`${d}T00:00:00Z`) + days * 864e5).toISOString().slice(0, 10)
  const later = shift_later && days ? sprints.filter((x) => x.id !== s.id && x.status !== 'closed' && x.starts_on > s.starts_on) : []
  for (const x of later) {
    const { error: e } = await supabase.from('sprints').update({ starts_on: shift(x.starts_on), ends_on: shift(x.ends_on) }).eq('id', x.id)
    if (e) return { error: e.message }
  }

  if (starts_on !== s.starts_on || ends_on !== s.ends_on) {
    await supabase.from('schedule_changes').insert({
      kind: 'extend_sprint', sprint_id: s.id, reason: null, actor_id: me.id, details: { starts_on, ends_on, moved: later.map((x) => x.name) },
      summary: `${s.name} now runs ${fmtDate(starts_on)} to ${fmtDate(ends_on)}${later.length ? `; ${later.map((x) => x.name).join(', ')} moved ${days > 0 ? '+' : ''}${days} days` : ''}.`,
    })
  }
  revalidatePath('/', 'layout')
  return {}
}

/** Takes a whole zone out of this release's plan, or adds it back. Its pages and cases stay. */
export async function setZoneInRelease(zone: string, inRelease: boolean): Promise<{ error?: string }> {
  const me = await getMe()
  if (me.role !== 'lead') return { error: 'Only the lead edits the plan' }
  const supabase = await createClient()
  if (!inRelease) {
    // Only a zone with nothing planned: its pages would otherwise vanish from open sprints.
    const [sprints, areas] = await Promise.all([loadSprints(), loadAreas()])
    const ids = areas.filter((a) => a.zone === zone).map((a) => a.id)
    const { count } = await supabase.from('sprint_areas').select('area_id', { count: 'exact', head: true }).in('area_id', ids).in('sprint_id', sprints.filter(planned).map((s) => s.id))
    if (count) return { error: `Set ${zone}'s pages to Not planned first` }
  }
  const { error, count } = await supabase.from('areas').update({ in_release: inRelease }, { count: 'exact' }).eq('zone', zone)
  if (error) return { error: error.message }
  if (!count) return { error: 'No such zone' }
  revalidatePath('/', 'layout')
  return {}
}
