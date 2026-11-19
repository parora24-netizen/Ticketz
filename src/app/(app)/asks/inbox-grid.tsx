'use client'

import Link from 'next/link'
import { DataGrid, type Column } from '@/components/grid/data-grid'
import { rememberList } from '@/components/list-nav'
import { Chip } from '@/components/ui'

export type InboxRow = { type: string; title: string; href: string; zone?: string; detail?: string; due_on?: string | null; overdue?: boolean; count?: number }

const TYPE: Record<string, string> = { need: 'Need', question: 'Question', decision: 'Decision', ticket: 'Ticket', run: 'Run', retest: 'Retest', pr: 'Review', detail: 'Complete text', rewrite: 'Rewrite', approve: 'Approve', runner: 'Runner' }

/** Everything waiting on one person, overdue first, filterable by type and zone like the other grids. */
export function InboxGrid({ rows }: { rows: InboxRow[] }) {
  const cols: Column<InboxRow & { id: string; n: number }>[] = [
    { key: 'type', header: 'Type', width: 120, value: (r) => TYPE[r.type] ?? r.type,
      render: (r) => <Chip tone={r.overdue ? 'crit' : 'muted'}>{TYPE[r.type] ?? r.type}</Chip> },
    { key: 'title', header: 'What', width: 460, value: (r) => r.title,
      render: (r) => <Link href={r.href} className="font-medium text-[var(--accent)] hover:underline">{r.title}</Link> },
    { key: 'zone', header: 'Zone', width: 130, value: (r) => r.zone || 'No zone' },
    { key: 'detail', header: 'Detail', width: 240, value: (r) => r.detail ?? '' },
    { key: 'due', header: 'Due', width: 130, mono: true, value: (r) => r.due_on ?? '', sortValue: (r) => r.due_on ?? '9999',
      render: (r) => r.due_on ? <span className={r.overdue ? 'font-semibold text-[var(--crit)]' : ''}>{r.overdue ? 'overdue · ' : ''}{r.due_on}</span> : <span className="text-[var(--faint)]">—</span> },
    { key: 'order', header: '#', width: 50, align: 'right', value: (r) => r.n },
  ]
  const askKey = (href: string) => /^\/asks\/([A-Z]+-\d+)$/.exec(href)?.[1]
  return (
    <DataGrid rows={rows.map((r, n) => ({ ...r, id: `${n}`, n: n + 1 }))} columns={cols} csvName="my-asks" selectable={false} searchPlaceholder="Search what waits on you"
      defaultSort={[{ key: 'order', dir: 1 }]} emptyText="Nothing waits on you."
      onView={(shown) => rememberList('asks', shown.map((r) => askKey(r.href)).filter((k): k is string => !!k), 'what waits on you')}
      charts={[{ key: 'type', title: 'By type' }, { key: 'zone', title: 'By zone' }]} />
  )
}
