'use client'

import Link from 'next/link'
import { DataGrid, type Column } from '@/components/grid/data-grid'
import { Chip } from '@/components/ui'
import { KIND_LABEL, type AskKind } from '@/lib/automation-loop'

type Row = { key: string; kind: AskKind; title: string; owner: string | null; due_on: string | null; state: string; status: string; cases_waiting: number; created_by: string | null; need_key: string | null }

const today = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10)

/** Every ask: what unblocks how many cases, who owns it and by when. */
export function AsksGrid({ rows }: { rows: Row[] }) {
  const cols: Column<Row & { id: string }>[] = [
    { key: 'key', header: 'Ask', width: 90, mono: true, value: (r) => r.key,
      render: (r) => <Link href={`/asks/${r.key}`} className="font-medium text-[var(--accent)] hover:underline">{r.key}</Link> },
    { key: 'kind', header: 'Kind', width: 100, value: (r) => KIND_LABEL[r.kind] },
    { key: 'title', header: 'Title', width: 380, value: (r) => r.title },
    { key: 'status', header: 'State', width: 110, value: (r) => r.status,
      render: (r) => <Chip tone={r.state === 'open' ? 'accent' : r.state === 'done' ? 'good' : 'muted'}>{r.status}</Chip> },
    { key: 'cases', header: 'Cases waiting', width: 120, align: 'right', value: (r) => r.cases_waiting },
    { key: 'owner', header: 'Owner', width: 120, value: (r) => r.owner ?? 'No owner' },
    { key: 'due', header: 'Due', width: 110, mono: true, value: (r) => r.due_on ?? '',
      render: (r) => r.due_on ? <span className={r.state === 'open' && r.due_on < today() ? 'font-semibold text-[var(--crit)]' : ''}>{r.due_on}</span> : <span className="text-[var(--faint)]">—</span> },
    { key: 'need_key', header: 'Need key', width: 160, mono: true, value: (r) => r.need_key ?? '' },
    { key: 'by', header: 'Asked by', width: 140, value: (r) => r.created_by ?? '' },
  ]
  return (
    <DataGrid rows={rows.map((r) => ({ ...r, id: r.key }))} columns={cols} csvName="asks" selectable={false} searchPlaceholder="Search asks"
      defaultSort={[{ key: 'cases', dir: -1 }]} defaultFilters={{ status: ['requested', 'open'] }}
      charts={[{ key: 'kind', title: 'By kind' }, { key: 'status', title: 'By state' }, { key: 'owner', title: 'By owner' }]} />
  )
}
