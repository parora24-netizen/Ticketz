'use client'

import Link from '@/components/link'
import { useRouter } from 'next/navigation'
import { DataGrid, type Column } from '@/components/grid/data-grid'
import { rememberList } from '@/components/list-nav'
import { Chip } from '@/components/ui'
import { KIND_LABEL, type AskKind } from '@/lib/automation-loop'
import { changeAsk } from './actions'

type Row = { key: string; kind: AskKind; title: string; zone: string; sprint?: string | null; owner: string | null; due_on: string | null; state: string; status: string; cases_waiting: number; created_by: string | null; need_key: string | null }

const today = () => new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10)

/** Every ask: what it is, which zone, who owns it and by when, and how many cases wait on it. */
export function AsksGrid({ rows, people }: { rows: Row[]; people: string[] }) {
  const router = useRouter()
  const owners = [{ value: '__none', label: 'No owner' }, ...people.map((p) => ({ value: p, label: p }))]
  const cols: Column<Row & { id: string }>[] = [
    { key: 'key', header: 'Ask', width: 90, mono: true, value: (r) => r.key, sortValue: (r) => Number(r.key.split('-')[1]),
      render: (r) => <Link href={`/asks/${r.key}`} className="font-medium text-[var(--accent)] hover:underline">{r.key}</Link> },
    { key: 'title', header: 'Title', width: 380, value: (r) => r.title },
    { key: 'zone', header: 'Zone', width: 130, value: (r) => r.zone || 'No zone' },
    { key: 'sprint', header: 'Sprint', width: 90, value: (r) => r.sprint || 'No sprint' },
    { key: 'owner', header: 'Owner', width: 130, value: (r) => r.owner ?? 'No owner', edit: { field: 'owner', kind: 'select', options: owners } },
    { key: 'status', header: 'State', width: 110, value: (r) => r.status,
      render: (r) => <Chip tone={r.state === 'open' ? 'accent' : r.state === 'done' ? 'good' : 'muted'}>{r.status}</Chip> },
    { key: 'due', header: 'Due', width: 110, mono: true, value: (r) => r.due_on ?? '', edit: { field: 'due_on', kind: 'date' },
      render: (r) => r.due_on ? <span className={r.state === 'open' && r.due_on < today() ? 'font-semibold text-[var(--crit)]' : ''}>{r.due_on}</span> : <span className="text-[var(--faint)]">—</span> },
    { key: 'kind', header: 'Kind', width: 100, value: (r) => KIND_LABEL[r.kind] },
    { key: 'cases', header: 'Cases waiting', width: 120, align: 'right', value: (r) => r.cases_waiting },
    { key: 'by', header: 'Asked by', width: 140, value: (r) => r.created_by ?? '' },
    { key: 'need_key', header: 'Need key', width: 160, mono: true, value: (r) => r.need_key ?? '' },
  ]
  return (
    <DataGrid rows={rows.map((r) => ({ ...r, id: r.key }))} columns={cols} csvName="asks" selectable searchPlaceholder="Search asks"
      defaultSort={[{ key: 'cases', dir: -1 }]} initialFilters={{ status: ['requested', 'open'] }}
      onView={(shown) => rememberList('asks', shown.map((r) => r.key), shown.length === rows.length ? 'all asks' : 'your filtered asks')}
      charts={[{ key: 'status', title: 'By state' }, { key: 'owner', title: 'By owner' }, { key: 'zone', title: 'By zone' }, { key: 'sprint', title: 'By sprint' }, { key: 'kind', title: 'By kind' }]}
      onSave={async (ids, patch) => {
        // Owner and due date, one ask at a time through the same change the ask page makes.
        const p: { owner?: string | null; due_on?: string | null } = {}
        if ('owner' in patch) p.owner = patch.owner === '__none' || !patch.owner ? null : patch.owner
        if ('due_on' in patch) p.due_on = patch.due_on || null
        for (const id of ids) {
          const res = await changeAsk(id, p)
          if (res.error) return { error: `${id}: ${res.error}` }
        }
        router.refresh()
        return {}
      }} />
  )
}
