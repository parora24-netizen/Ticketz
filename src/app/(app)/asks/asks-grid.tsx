'use client'

import Link from '@/components/link'
import { useRouter } from 'next/navigation'
import { DataGrid, type Column } from '@/components/grid/data-grid'
import { rememberList } from '@/components/list-nav'
import { Chip } from '@/components/ui'
import { KIND_LABEL, askDisplay, type AskKind, type AskState } from '@/lib/automation-loop'
import { changeAsk } from './actions'

type Row = { key: string; kind: AskKind; outcome?: string | null; suite_need?: string | null; handed_from?: string | null; title: string; zone: string; sprint?: string | null; owner: string | null; due_on: string | null; state: string; status: string; cases_waiting: number; created_by: string | null; need_key: string | null }

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
    { key: 'owner', header: 'Owner', width: 130, value: (r) => r.owner ?? 'No owner', edit: { field: 'owner', kind: 'select', options: owners },
      render: (r) => <span title={r.handed_from ? `Handed over by ${r.handed_from} until ${r.owner} replies` : undefined}>{r.owner ?? <span className="text-[var(--faint)]">No owner</span>}{r.handed_from && <span className="text-[var(--muted)]"> ← {r.handed_from}</span>}</span> },
    // Open (the owner's move), Answered (the raiser's: close or send back), Closed; how it was answered is its Outcome.
    { key: 'state', header: 'State', width: 90, value: (r) => askDisplay(r.kind, r.state as AskState).state,
      render: (r) => <Chip tone={r.state === 'open' ? 'accent' : r.state === 'answered' ? 'good' : 'muted'}>{askDisplay(r.kind, r.state as AskState).state}</Chip> },
    { key: 'outcome', header: 'Outcome', width: 140, value: (r) => askDisplay(r.kind, r.state as AskState, r.outcome, r.suite_need).outcome || 'Not yet',
      render: (r) => { const o = askDisplay(r.kind, r.state as AskState, r.outcome, r.suite_need).outcome; return o ? <span className={o === 'Suite change' ? 'font-medium text-[var(--warn)]' : ''} title={r.suite_need ?? undefined}>{o}</span> : <span className="text-[var(--faint)]">Not yet</span> } },
    { key: 'due', header: 'Due', width: 110, mono: true, value: (r) => r.due_on ?? '', edit: { field: 'due_on', kind: 'date' },
      render: (r) => r.due_on ? <span className={r.state === 'open' && r.due_on < today() ? 'font-semibold text-[var(--crit)]' : ''}>{r.due_on}</span> : <span className="text-[var(--faint)]">—</span> },
    { key: 'kind', header: 'Kind', width: 100, value: (r) => KIND_LABEL[r.kind] },
    { key: 'cases', header: 'Cases waiting', width: 120, align: 'right', value: (r) => r.cases_waiting },
    { key: 'by', header: 'Asked by', width: 140, value: (r) => r.created_by ?? '' },
    { key: 'need_key', header: 'Need key', width: 160, mono: true, value: (r) => r.need_key ?? '' },
  ]
  return (
    <DataGrid rows={rows.map((r) => ({ ...r, id: r.key }))} columns={cols} csvName="asks" selectable searchPlaceholder="Search asks"
      defaultSort={[{ key: 'cases', dir: -1 }]} initialFilters={{ state: ['Open'] }}
      onView={(shown) => rememberList('asks', shown.map((r) => r.key), shown.length === rows.length ? 'all asks' : 'your filtered asks')}
      charts={[{ key: 'state', title: 'By state', order: ['Open', 'Answered', 'Closed'] }, { key: 'outcome', title: 'By outcome' }, { key: 'owner', title: 'By owner' }, { key: 'zone', title: 'By zone' }, { key: 'sprint', title: 'By sprint' }, { key: 'kind', title: 'By kind' }]}
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
