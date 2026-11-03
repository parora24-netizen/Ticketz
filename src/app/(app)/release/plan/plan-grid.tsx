'use client'

import Link from 'next/link'
import { DataGrid, type BulkField, type Column } from '@/components/grid/data-grid'
import { STATUS_TONE as TONE } from '@/components/grid/filter-cards'
import { Chip } from '@/components/ui'
import { updatePages } from '@/app/(app)/cases/progress/actions'

export type PlanRow = {
  id: string; zone: string; page: string; writer: string; owner_id: string | null
  due_on: string | null; writing: string; done: boolean; late: boolean
  automate_due_on: string | null; automation: string; automateLate: boolean
  test: string; testStart: string; fix: string; fixDates: string; fixStart: string
}

const fmt = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const dash = <span className="text-[var(--faint)]">---</span>

/** Each page's dates: writing and automation due (the lead edits them here), and the sprints that test and fix it. */
export function PlanGrid({ rows, team, isLead }: { rows: PlanRow[]; team: { value: string; label: string }[]; isLead: boolean }) {
  const due = (d: string | null, late: boolean) => d
    ? <span className={late ? 'font-semibold text-[var(--crit)]' : ''}>{fmt(d)}{late ? ' · late' : ''}</span>
    : <span className="text-[var(--faint)]">{isLead ? 'Set date' : '—'}</span>
  const sprint = (name: string, dates: string) => name ? <span><b className="font-semibold">{name}</b> <span className="text-[var(--muted)]">{dates}</span></span> : <span className="text-[var(--faint)]">—</span>
  const lead = <E,>(e: E) => (isLead ? e : undefined)
  const cols: Column<PlanRow>[] = [
    { key: 'zone', header: 'Zone', width: 130, value: (r) => r.zone },
    { key: 'page', header: 'Page', width: 160, value: (r) => r.page,
      render: (r) => <Link href={`/cases?area=${r.id}`} className="font-semibold text-[var(--accent)] hover:underline">{r.page}</Link> },
    { key: 'writer', header: 'Writer', width: 110, value: (r) => r.writer,
      edit: lead({ field: 'owner_id', kind: 'select' as const, options: [{ value: '__none', label: 'No one' }, ...team] }) },
    { key: 'writing', header: 'Writing', width: 120, value: (r) => r.writing, render: (r) => <Chip tone={TONE[r.writing] ?? 'muted'}>{r.writing}</Chip> },
    { key: 'due', header: 'Writing due', width: 120, mono: true, value: (r) => (r.done ? '' : r.due_on) ?? '',
      render: (r) => (r.done ? dash : due(r.due_on, r.late)), edit: lead({ field: 'due_on', kind: 'date' as const }), editable: (r) => !r.done },
    { key: 'automation', header: 'Automation', width: 130, value: (r) => r.automation, render: (r) => <Chip tone={TONE[r.automation] ?? 'muted'}>{r.automation}</Chip> },
    { key: 'autoDue', header: 'Automation due', width: 130, mono: true, value: (r) => (r.automation === 'Fully automated' ? '' : r.automate_due_on) ?? '',
      render: (r) => (r.automation === 'Fully automated' ? dash : due(r.automate_due_on, r.automateLate)),
      edit: lead({ field: 'automate_due_on', kind: 'date' as const }), editable: (r) => r.automation !== 'Fully automated' },
    { key: 'test', header: 'Tested', width: 130, value: (r) => r.test, sortValue: (r) => r.testStart, render: (r) => r.test || <span className="text-[var(--faint)]">—</span> },
    { key: 'fix', header: 'Fixed in', width: 170, value: (r) => r.fix, sortValue: (r) => r.fixStart, render: (r) => sprint(r.fix, r.fixDates) },
  ]
  const bulk: BulkField[] = isLead ? [
    { field: 'owner_id', label: 'Set writer', options: team },
    { field: 'due_on', label: 'Writing due', kind: 'date' },
    { field: 'automate_due_on', label: 'Automation due', kind: 'date' },
  ] : []
  return (
    <DataGrid rows={rows} columns={cols} csvName="release-plan-pages" searchPlaceholder="Search pages" selectable={isLead}
      charts={[
        { key: 'writing', title: 'Writing', order: ['Completed', 'Writing', 'Late', 'Not started'] },
        { key: 'automation', title: 'Automation', order: ['Fully automated', 'Partly', 'Late', 'Not started', 'No cases'] },
        { key: 'test', title: 'Tested' },
        { key: 'fix', title: 'Fixed in' },
      ]}
      bulkFields={bulk}
      onSave={isLead ? (ids, patch) => {
        const p: Parameters<typeof updatePages>[1] = {}
        if ('owner_id' in patch) p.owner_id = patch.owner_id === '__none' ? null : patch.owner_id
        if ('due_on' in patch) p.due_on = patch.due_on
        if ('automate_due_on' in patch) p.automate_due_on = patch.automate_due_on
        return updatePages(ids, p)
      } : undefined} />
  )
}
