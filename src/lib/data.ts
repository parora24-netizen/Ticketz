import 'server-only'
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import type { Automation, CaseForStage, Priority, RunResult } from '@/lib/workflow/case-stage'
import type { TicketState } from '@/lib/workflow/ticket-machine'


export type Area = { id: string; zone: string; page: string; sort: number }
export type Sprint = {
  id: string
  name: string
  starts_on: string
  ends_on: string
  status: 'planned' | 'active' | 'closed'
  goal: string | null
  kind: 'triage' | 'test' | 'fix' | 'regression'
}
export type CaseRow = {
  id: string
  tc_id: string
  title: string
  priority: Priority
  automation: Automation
  area_id: string
  source_page: string | null
  zone: string
  page: string
  area_sort: number
  auto_result: RunResult | null
  auto_at: string | null
  auto_sprint_id: string | null
  manual_result: RunResult | null
  manual_at: string | null
  manual_sprint_id: string | null
  tester_id: string | null
  tester_name: string | null
  open_fix: number
  awaiting_retest: number
}
export type TicketRow = {
  id: string
  key: string
  kind: 'defect' | 'test_mismatch'
  case_id: string | null
  title: string
  description: string | null
  severity: Priority
  state: TicketState
  owner_id: string | null
  owner_name: string | null
  found_in_sprint_id: string | null
  current_sprint_id: string | null
  fixed_in_build: string | null
  defer_reason: string | null
  logged_on: string
  updated_at: string
  tc_id: string | null
  zone: string | null
  page: string | null
  area_id: string | null
}
export type Person = { id: string; name: string; email: string | null; role: 'lead' | 'dev' | 'qa'; active: boolean }

type Page<T> = (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>

/** Reads every row past PostgREST's 1,000-row page limit. */
export async function fetchAll<T>(page: Page<T>): Promise<T[]> {
  const out: T[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await page(from, from + 999)
    if (error) throw new Error(error.message)
    out.push(...(data ?? []))
    if (!data || data.length < 1000) return out
  }
}

export const loadAreas = cache(async function loadAreas(): Promise<Area[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('areas').select('*').order('sort')
  if (error) throw new Error(error.message)
  return data as Area[]
})

export const loadSprints = cache(async function loadSprints(): Promise<Sprint[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('sprints').select('*').order('starts_on')
  if (error) throw new Error(error.message)
  return data as Sprint[]
})

export const loadSprintAreas = cache(async function loadSprintAreas(): Promise<{ sprint_id: string; area_id: string }[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('sprint_areas').select('sprint_id, area_id')
  if (error) throw new Error(error.message)
  return data ?? []
})

export const loadPeople = cache(async function loadPeople(): Promise<Person[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('people').select('id, name, email, role, active').order('name')
  if (error) throw new Error(error.message)
  return data as Person[]
})

export async function loadCases(areaIds?: string[]): Promise<CaseRow[]> {
  const supabase = await createClient()
  return fetchAll<CaseRow>((from, to) => {
    let q = supabase.from('case_latest').select('*').order('area_sort').order('tc_id').range(from, to)
    if (areaIds) q = q.in('area_id', areaIds.length ? areaIds : ['00000000-0000-0000-0000-000000000000'])
    return q
  })
}

export const loadTickets = cache(async function loadTickets(): Promise<TicketRow[]> {
  const supabase = await createClient()
  return fetchAll<TicketRow>((from, to) =>
    supabase.from('ticket_list').select('*').order('logged_on', { ascending: false }).order('key').range(from, to),
  )
})

/** Which cases got an automated / manual result during a sprint. */
export async function loadSprintRuns(sprintId: string): Promise<{ auto: Set<string>; manual: Set<string> }> {
  const supabase = await createClient()
  const rows = await fetchAll<{ case_id: string; kind: 'auto' | 'manual' }>((from, to) =>
    supabase.from('test_runs').select('case_id, kind').eq('sprint_id', sprintId).range(from, to),
  )
  const auto = new Set<string>()
  const manual = new Set<string>()
  for (const r of rows) (r.kind === 'auto' ? auto : manual).add(r.case_id)
  return { auto, manual }
}

// Every real result counts toward the stage, so sprint runs are no longer needed here; the
// argument stays so callers don't change.
export function toStageInput(c: CaseRow, _runs?: { auto: Set<string>; manual: Set<string> }): CaseForStage {
  return {
    priority: c.priority,
    automation: c.automation,
    auto_result: c.auto_result,
    manual_result: c.manual_result,
    open_fix: c.open_fix,
    awaiting_retest: c.awaiting_retest,
  }
}

/** Testing and fixing run side by side: QA's track (triage, test, regression) and the devs' (fix). */
export type Track = 'qa' | 'dev'
export const trackOf = (s: { kind: Sprint['kind'] }): Track => (s.kind === 'fix' ? 'dev' : 'qa')

/** A track's running sprint: the one marked active, else the one whose dates cover today. QA's by default. */
export function currentSprint(sprints: Sprint[], today = new Date().toISOString().slice(0, 10), track: Track = 'qa'): Sprint | null {
  const mine = sprints.filter((s) => trackOf(s) === track)
  return (
    mine.find((s) => s.status === 'active') ??
    mine.find((s) => s.starts_on <= today && today <= s.ends_on && s.status !== 'closed') ??
    null
  )
}

/** The running sprint on each track (QA first), for headers and tabs. */
export function runningSprints(sprints: Sprint[], today = new Date().toISOString().slice(0, 10)): Sprint[] {
  return (['qa', 'dev'] as const).map((t) => currentSprint(sprints, today, t)).filter((s): s is Sprint => !!s)
}

/** "1 day left", "3 days left" (never negative). */
export function daysLeft(date: string): string {
  const n = Math.max(daysUntil(date), 0)
  return n === 1 ? '1 day left' : `${n} days left`
}

export function daysUntil(date: string, today = new Date()): number {
  const ms = Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today.toISOString().slice(0, 10)}T00:00:00Z`)
  return Math.round(ms / 864e5)
}

export function fmtDate(d: string | null): string {
  if (!d) return '—'
  const dt = new Date(d.length === 10 ? `${d}T00:00:00Z` : d)
  return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

export type Activity = {
  kind: 'ticket' | 'comment' | 'result' | 'case' | 'task'
  at: string
  actor_id: string | null
  subject_owner_id: string | null
  ref: string
  title: string
  what: string
  detail: string | null
}

export async function loadActivity(since: Date, limit = 1000): Promise<Activity[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('activity').select('*').gte('at', since.toISOString()).order('at', { ascending: false }).limit(limit)
  if (error) throw new Error(error.message)
  return (data ?? []) as Activity[]
}

export type PlanTask = { id: string; num: number; phase: string; title: string; owner_label: string; owner_id: string | null; due_on: string; status: string; sprint_id: string | null; note: string | null }

export const loadTasks = cache(async function loadTasks(): Promise<PlanTask[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('plan_tasks').select('id, num, phase, title, owner_label, owner_id, due_on, status, sprint_id, note').order('num')
  if (error) throw new Error(error.message)
  return (data ?? []) as PlanTask[]
})

export function timeAgo(iso: string, now = new Date()): string {
  const mins = Math.round((now.getTime() - Date.parse(iso)) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const h = Math.round(mins / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.round(h / 24)}d ago`
}

export const loadTicketEvents = cache(async function loadTicketEvents(): Promise<{ ticket_id: string; to_state: string; at: string }[]> {
  const supabase = await createClient()
  return fetchAll((from, to) => supabase.from('ticket_events').select('ticket_id, to_state, at').order('at').range(from, to))
})

export const loadManualRuns = cache(async function loadManualRuns(): Promise<{ case_id: string; result: string; recorded_at: string }[]> {
  const supabase = await createClient()
  return fetchAll((from, to) => supabase.from('test_runs').select('case_id, result, recorded_at').eq('kind', 'manual').order('recorded_at').range(from, to))
})

/** Every result recorded in a sprint, with its time, for the sprint's daily chart. */
export async function loadSprintRunTimes(sprintId: string): Promise<{ case_id: string; result: string; recorded_at: string }[]> {
  const supabase = await createClient()
  return fetchAll((from, to) =>
    supabase.from('test_runs').select('case_id, result, recorded_at').eq('sprint_id', sprintId).order('recorded_at').range(from, to),
  )
}

export type Release = { name: string; release_on: string; go_no_go_on: string; original_release_on: string }

/** The release's dates. They move when sprints spill over, so they live in the database. */
export const loadRelease = cache(async function loadRelease(): Promise<Release> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('release_settings').select('name, release_on, go_no_go_on, original_release_on').eq('id', 1).single()
  if (error) throw new Error(error.message)
  return data as Release
})

export type ScheduleChange = { id: number; kind: string; summary: string; reason: string | null; at: string; actor: string | null; sprint_id: string | null }

export const loadScheduleChanges = cache(async function loadScheduleChanges(): Promise<ScheduleChange[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('schedule_changes').select('id, kind, summary, reason, at, sprint_id, people(name)').order('at', { ascending: false }).limit(100)
  if (error) throw new Error(error.message)
  return (data ?? []).map((r) => ({ id: r.id, kind: r.kind, summary: r.summary, reason: r.reason, at: r.at, sprint_id: r.sprint_id, actor: (r.people as unknown as { name: string } | null)?.name ?? null }))
})
