import 'server-only'
import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import type { Automation, CaseForStage, Priority, RunResult } from '@/lib/workflow/case-stage'
import type { TicketState } from '@/lib/workflow/ticket-machine'

export const RELEASE_DATE = '2026-12-04'
export const GO_NO_GO_DATE = '2026-12-03'

export type Area = { id: string; zone: string; page: string; sort: number }
export type Sprint = {
  id: string
  name: string
  starts_on: string
  ends_on: string
  status: 'planned' | 'active' | 'closed'
  goal: string | null
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

export function toStageInput(c: CaseRow, runs?: { auto: Set<string>; manual: Set<string> }): CaseForStage {
  return {
    priority: c.priority,
    automation: c.automation,
    auto_result: c.auto_result,
    manual_result: c.manual_result,
    auto_in_sprint: runs?.auto.has(c.id) ?? false,
    manual_in_sprint: runs?.manual.has(c.id) ?? false,
    open_fix: c.open_fix,
    awaiting_retest: c.awaiting_retest,
  }
}

/** The sprint whose dates cover today, else the one marked active. */
export function currentSprint(sprints: Sprint[], today = new Date().toISOString().slice(0, 10)): Sprint | null {
  return (
    sprints.find((s) => s.status === 'active') ??
    sprints.find((s) => s.starts_on <= today && today <= s.ends_on && s.status !== 'closed') ??
    null
  )
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

export type PlanTask = { id: string; num: number; phase: string; title: string; owner_label: string; owner_id: string | null; due_on: string; status: string }

export const loadTasks = cache(async function loadTasks(): Promise<PlanTask[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.from('plan_tasks').select('id, num, phase, title, owner_label, owner_id, due_on, status').order('num')
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
