'use client'

import Link from 'next/link'
import { DataGrid, type Column } from '@/components/grid/data-grid'
import { PriorityChip, ResultChip } from '@/components/ui'
import type { Priority, RunResult } from '@/lib/workflow/case-stage'
import { recordResults, updateCases } from '../actions'

export type CaseGridRow = {
  id: string
  tc_id: string
  title: string
  area: string
  priority: Priority
  automation: 'not_automated' | 'automated' | 'manual_only'
  auto_result: RunResult | null
  manual_result: RunResult | null
  stage: string
  open_tickets: number
  tester_name: string | null
}

const AUTOMATION = [
  { value: 'automated', label: 'Automated' },
  { value: 'not_automated', label: 'Not yet' },
  { value: 'manual_only', label: 'Manual only' },
]
const PRIORITY = ['Critical', 'High', 'Medium', 'Low'].map((p) => ({ value: p, label: p }))
const RESULT_LABEL: Record<RunResult, string> = { passed: 'Passed', failed: 'Failed', known_defect: 'Known defect', skipped: 'Skipped', blocked: 'Blocked' }

export function CasesGrid({ rows, areas, people, canEdit, inSprint }: {
  rows: CaseGridRow[]; areas: { value: string; label: string }[]; people: { value: string; label: string }[]; canEdit: boolean; inSprint?: boolean
}) {
  const testers = [{ value: '__none', label: 'No tester' }, ...people]
  const columns: Column<CaseGridRow>[] = [
    { key: 'tc_id', header: 'ID', width: 130, mono: true, value: (r) => r.tc_id,
      render: (r) => <Link href={`/cases/${r.tc_id}`} className="font-medium text-[var(--accent)] hover:underline">{r.tc_id}</Link> },
    { key: 'title', header: 'Title', width: 380, value: (r) => r.title, edit: canEdit ? { field: 'title', kind: 'text' } : undefined },
    { key: 'area', header: 'Area', width: 220, value: (r) => r.area, edit: canEdit ? { field: 'area_id', kind: 'select', options: areas } : undefined },
    { key: 'priority', header: 'Priority', width: 110, sortValue: (r) => ['Critical', 'High', 'Medium', 'Low'].indexOf(r.priority), value: (r) => r.priority, render: (r) => <PriorityChip p={r.priority} />,
      edit: canEdit ? { field: 'priority', kind: 'select', options: PRIORITY } : undefined },
    { key: 'tester', header: 'Tester', width: 140, value: (r) => r.tester_name ?? 'No tester',
      edit: canEdit ? { field: 'tester_id', kind: 'select', options: testers } : undefined },
    { key: 'automation', header: 'Automation', width: 130, value: (r) => AUTOMATION.find((a) => a.value === r.automation)!.label,
      edit: canEdit ? { field: 'automation', kind: 'select', options: AUTOMATION } : undefined },
    { key: 'auto', header: 'Auto result', width: 120, value: (r) => (r.auto_result ? RESULT_LABEL[r.auto_result] : 'Not run'), render: (r) => <ResultChip r={r.auto_result} /> },
    { key: 'manual', header: 'Manual result', width: 120, value: (r) => (r.manual_result ? RESULT_LABEL[r.manual_result] : 'Not tested'), render: (r) => <ResultChip r={r.manual_result} /> },
    ...(inSprint ? [{ key: 'stage', header: 'Stage', width: 120, value: (r: CaseGridRow) => r.stage }] : []),
    { key: 'tickets', header: 'Open tickets', width: 100, align: 'right', value: (r) => r.open_tickets || null },
  ]
  return (
    <DataGrid
      rows={rows}
      columns={columns}
      csvName="test-cases"
      charts={[
        { key: 'area', title: 'By area' },
        { key: 'priority', title: 'By priority', order: ['Critical', 'High', 'Medium', 'Low'] },
        { key: 'manual', title: 'Manual result', order: ['Passed', 'Failed', 'Blocked', 'Not tested'] },
        inSprint
          ? { key: 'stage', title: 'Stage in this sprint', order: ['To test', 'Fix', 'Retest', 'Done'] }
          : { key: 'automation', title: 'Automation', order: ['Automated', 'Not yet', 'Manual only'] },
      ]}
      emptyText="No test cases match."
      onSave={canEdit ? (ids, patch) => {
        const p: Record<string, string | null> = { ...patch }
        if (p.tester_id === '__none') p.tester_id = null
        return updateCases(ids, p as Parameters<typeof updateCases>[1])
      } : undefined}
      bulkFields={canEdit ? [
        { field: 'tester_id', label: 'Assign tester', options: testers },
        { field: 'priority', label: 'Set priority', options: PRIORITY },
        { field: 'automation', label: 'Set automation', options: AUTOMATION },
        { field: 'area_id', label: 'Move to area', options: areas },
      ] : []}
      bulkActions={canEdit ? [
        { label: 'Record Pass', run: (ids) => recordResults(ids, 'passed'), confirm: 'Record a manual Pass for {n} cases?' },
        { label: 'Record Fail', run: (ids) => recordResults(ids, 'failed'), confirm: 'Record a manual Fail for {n} cases? Raise tickets from each case page or the Fix column.' },
        { label: 'Record Blocked', run: (ids) => recordResults(ids, 'blocked') },
      ] : []}
    />
  )
}
