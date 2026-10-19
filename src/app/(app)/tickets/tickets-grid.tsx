'use client'

import Link from 'next/link'
import { DataGrid, type Column } from '@/components/grid/data-grid'
import { PriorityChip, StateChip } from '@/components/ui'
import { STATE_LABEL } from '@/lib/workflow/ticket-machine'
import type { BoardTicket } from '@/components/board/ticket-board'
import { deleteRows, updateTickets } from '../actions'
import { rememberTicketList } from '@/components/ticket-nav'

type Row = BoardTicket & { kind: 'defect' | 'test_mismatch'; logged_on: string }
const SEVERITY = ['Critical', 'High', 'Medium', 'Low'].map((p) => ({ value: p, label: p }))

export function TicketsGrid({ rows, people, canTriage, isLead, state, remember = true }: { rows: Row[]; people: { value: string; label: string }[]; canTriage: boolean; isLead?: boolean; state?: string; remember?: boolean }) {
  const owners = [{ value: '__none', label: 'Unassigned' }, ...people]
  const columns: Column<Row>[] = [
    { key: 'key', header: 'Ticket', width: 170, mono: true, value: (r) => r.key,
      render: (r) => <Link href={`/tickets/${encodeURIComponent(r.key)}`} className="font-medium text-[var(--accent)] hover:underline">{r.key}</Link> },
    { key: 'title', header: 'Title', width: 360, value: (r) => r.title, edit: canTriage ? { field: 'title', kind: 'text' } : undefined },
    { key: 'severity', header: 'Severity', width: 110, sortValue: (r) => ['Critical', 'High', 'Medium', 'Low'].indexOf(r.severity), value: (r) => r.severity, render: (r) => <PriorityChip p={r.severity} />,
      edit: canTriage ? { field: 'severity', kind: 'select', options: SEVERITY } : undefined },
    { key: 'state', header: 'State', width: 140, value: (r) => STATE_LABEL[r.state], render: (r) => <StateChip s={r.state} /> },
    { key: 'owner', header: 'Owner', width: 140, value: (r) => r.owner_name ?? 'Unassigned',
      edit: { field: 'owner_id', kind: 'select', options: owners } },
    { key: 'kind', header: 'Kind', width: 100, value: (r) => (r.kind === 'defect' ? 'Defect' : 'Test issue') },
    { key: 'area', header: 'Area', width: 200, value: (r) => (r.zone ? `${r.zone} · ${r.page}` : '') },
    { key: 'logged', header: 'Logged', width: 110, mono: true, value: (r) => r.logged_on },
  ]
  return (
    <DataGrid
      rows={rows}
      columns={columns}
      csvName="tickets"
      remember={remember}
      onView={(shown) => rememberTicketList(shown.map((r) => r.key), shown.length === rows.length ? 'all tickets' : 'your filtered tickets')}
      charts={[
        { key: 'state', title: 'By state', order: Object.values(STATE_LABEL) },
        { key: 'severity', title: 'By severity', order: ['Critical', 'High', 'Medium', 'Low'] },
        { key: 'owner', title: 'By owner' },
        { key: 'area', title: 'By area' },
      ]}
      defaultFilters={state && state in STATE_LABEL ? { state: [STATE_LABEL[state as keyof typeof STATE_LABEL]] } : undefined}
      defaultSort={[{ key: 'severity', dir: 1 }]}
      emptyText="No tickets match."
      onSave={(ids, patch) => {
        const p: Record<string, string | null> = { ...patch }
        if (p.owner_id === '__none') p.owner_id = null
        return updateTickets(ids, p as Parameters<typeof updateTickets>[1])
      }}
      bulkFields={canTriage ? [
        { field: 'owner_id', label: 'Assign to', options: owners },
        { field: 'severity', label: 'Set severity', options: SEVERITY },
      ] : []}
      bulkActions={isLead ? [{ label: 'Delete', run: (ids) => deleteRows('tickets', ids), confirm: 'Delete {n} tickets for good, with their history and comments? This cannot be undone.' }] : []}
    />
  )
}
