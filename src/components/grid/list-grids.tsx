'use client'

import Link from 'next/link'
import { DataGrid, type Column } from '@/components/grid/data-grid'
import { Chip } from '@/components/ui'
import { updatePeople, updateTasks } from '@/app/(app)/actions'

// ---- Sprints ---------------------------------------------------------------------------------

export type SprintRow = { id: string; name: string; dates: string; starts_on: string; days: number; areas: string; cases: number; status: string; goal: string; current: boolean }

export function SprintsGrid({ rows }: { rows: SprintRow[] }) {
  const cols: Column<SprintRow>[] = [
    { key: 'name', header: 'Sprint', width: 90, value: (r) => r.name,
      render: (r) => <Link href={`/sprints/${r.id}`} className="font-semibold text-[var(--accent)] hover:underline">{r.name}{r.current ? ' · now' : ''}</Link> },
    { key: 'start', header: 'Starts', width: 110, mono: true, value: (r) => r.starts_on },
    { key: 'dates', header: 'Dates', width: 150, value: (r) => r.dates },
    { key: 'days', header: 'Days', width: 70, align: 'right', value: (r) => r.days },
    { key: 'goal', header: 'Goal', width: 320, value: (r) => r.goal },
    { key: 'areas', header: 'Areas', width: 420, value: (r) => r.areas, filter: 'text' },
    { key: 'cases', header: 'Cases', width: 80, align: 'right', value: (r) => r.cases },
    { key: 'status', header: 'Status', width: 110, value: (r) => r.status,
      render: (r) => <Chip tone={r.status === 'Running' ? 'accent' : r.status === 'Closed' ? 'good' : 'muted'}>{r.status}</Chip> },
  ]
  return <DataGrid rows={rows} columns={cols} csvName="sprints" selectable={false} defaultSort={[{ key: 'start', dir: 1 }]} searchPlaceholder="Search sprints" />
}

// ---- Plan ------------------------------------------------------------------------------------

export type TaskRow = { id: string; num: number; phase: string; title: string; owner: string; due_on: string; status: string; late: boolean }
const STATUS = [
  { value: 'not_started', label: 'Not started' },
  { value: 'in_progress', label: 'In progress' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'done', label: 'Done' },
]

export function PlanGrid({ rows }: { rows: TaskRow[] }) {
  const cols: Column<TaskRow>[] = [
    { key: 'num', header: '#', width: 50, align: 'right', value: (r) => r.num },
    { key: 'phase', header: 'Phase', width: 110, value: (r) => r.phase },
    { key: 'title', header: 'Task', width: 480, value: (r) => r.title },
    { key: 'owner', header: 'Owner', width: 170, value: (r) => r.owner },
    { key: 'due', header: 'Due', width: 110, mono: true, value: (r) => r.due_on,
      render: (r) => <span className={r.late ? 'font-semibold text-[var(--crit)]' : ''}>{r.due_on}{r.late ? ' · late' : ''}</span> },
    { key: 'status', header: 'Status', width: 130, value: (r) => STATUS.find((s) => s.value === r.status)?.label ?? r.status,
      edit: { field: 'status', kind: 'select', options: STATUS } },
  ]
  return (
    <DataGrid rows={rows} columns={cols} csvName="release-plan"
      charts={[
        { key: 'status', title: 'By status', order: ['Not started', 'In progress', 'Blocked', 'Done'] },
        { key: 'phase', title: 'By phase' },
        { key: 'owner', title: 'By owner' },
      ]} defaultSort={[{ key: 'num', dir: 1 }]} searchPlaceholder="Search tasks"
      onSave={(ids, patch) => updateTasks(ids, patch as { status?: string })}
      bulkFields={[{ field: 'status', label: 'Set status', options: STATUS }]} />
  )
}

// ---- Areas -----------------------------------------------------------------------------------

export type AreaRow = { id: string; zone: string; page: string; sprints: string; cases: number; tested: number; passed: number; open: number; health: string }

export function AreasGrid({ rows }: { rows: AreaRow[] }) {
  const cols: Column<AreaRow>[] = [
    { key: 'zone', header: 'Zone', width: 140, value: (r) => r.zone },
    { key: 'page', header: 'Area', width: 170, value: (r) => r.page,
      render: (r) => <Link href={`/cases?area=${r.id}`} className="font-semibold text-[var(--accent)] hover:underline">{r.page}</Link> },
    { key: 'sprints', header: 'Sprints', width: 120, value: (r) => r.sprints },
    { key: 'cases', header: 'Cases', width: 80, align: 'right', value: (r) => r.cases },
    { key: 'tested', header: 'Tested', width: 80, align: 'right', value: (r) => r.tested },
    { key: 'passed', header: 'Passed', width: 80, align: 'right', value: (r) => r.passed },
    { key: 'open', header: 'Open tickets', width: 110, align: 'right', value: (r) => r.open || null },
    { key: 'health', header: 'Status', width: 150, value: (r) => r.health,
      render: (r) => <Chip tone={r.health === 'Passing' ? 'good' : r.health === 'Critical/High open' ? 'crit' : r.health === 'Failures open' ? 'warn' : r.health === 'Testing' ? 'accent' : 'muted'}>{r.health}</Chip> },
  ]
  return <DataGrid rows={rows} columns={cols} csvName="areas" charts={[{ key: 'zone', title: 'By zone' }, { key: 'health', title: 'By status' }]} selectable={false} searchPlaceholder="Search areas" />
}

// ---- Team ------------------------------------------------------------------------------------

export type PersonRow = { id: string; name: string; email: string | null; role: string; active: boolean }
const ROLES = [
  { value: 'lead', label: 'Lead' },
  { value: 'dev', label: 'Developer' },
  { value: 'qa', label: 'QA' },
]
const ACTIVE = [
  { value: 'yes', label: 'Active' },
  { value: 'no', label: 'Off' },
]

export function TeamGrid({ rows }: { rows: PersonRow[] }) {
  const cols: Column<PersonRow>[] = [
    { key: 'name', header: 'Name', width: 200, value: (r) => r.name, edit: { field: 'name', kind: 'text' } },
    { key: 'email', header: 'Email (sign-in)', width: 300, mono: true, value: (r) => r.email ?? '', edit: { field: 'email', kind: 'text' },
      render: (r) => r.email ?? <span className="font-sans text-[var(--crit)]">Add an email so they can sign in</span> },
    { key: 'role', header: 'Role', width: 130, value: (r) => ROLES.find((x) => x.value === r.role)?.label ?? r.role, edit: { field: 'role', kind: 'select', options: ROLES } },
    { key: 'active', header: 'Access', width: 110, value: (r) => (r.active ? 'Active' : 'Off'), edit: { field: 'active', kind: 'select', options: ACTIVE } },
  ]
  return (
    <DataGrid rows={rows} columns={cols} csvName="team" charts={[{ key: 'role', title: 'By role' }, { key: 'active', title: 'Access' }]} searchPlaceholder="Search people"
      onSave={(ids, patch) => updatePeople(ids, patch)}
      bulkFields={[{ field: 'role', label: 'Set role', options: ROLES }, { field: 'active', label: 'Set access', options: ACTIVE }]} />
  )
}
