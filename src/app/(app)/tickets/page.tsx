import Link from 'next/link'
import { PageHeader } from '@/components/ui'
import { Flash } from '@/components/flash'
import { TicketBoard } from '@/components/board/ticket-board'
import { getMe } from '@/lib/auth'
import { loadAreas, loadPeople, loadTickets } from '@/lib/data'
import { OPEN_STATES } from '@/lib/workflow/ticket-machine'
import { TicketsGrid } from './tickets-grid'

export default async function TicketsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams
  const view = sp.view === 'grid' ? 'grid' : 'board'
  const [me, tickets, people, areas] = await Promise.all([getMe(), loadTickets(), loadPeople(), loadAreas()])
  const zones = [...new Set(areas.map((a) => a.zone))]
  const open = tickets.filter((t) => OPEN_STATES.includes(t.state)).length
  const unowned = tickets.filter((t) => OPEN_STATES.includes(t.state) && !t.owner_id).length
  const rows = tickets.map((t) => ({
    id: t.id, key: t.key, title: t.title, severity: t.severity, state: t.state, owner_id: t.owner_id, owner_name: t.owner_name,
    tc_id: t.tc_id, zone: t.zone, page: t.page, updated_at: t.updated_at, kind: t.kind, logged_on: t.logged_on,
  }))

  return (
    <>
      <PageHeader sub={`${open} open · ${unowned} without an owner · ${tickets.length} in all`}>
        <div className="flex border border-[var(--line)] bg-white p-0.5" role="tablist" aria-label="View">
          <Link href="/tickets" role="tab" aria-selected={view === 'board'}
            className={`px-3 py-1 text-[12.5px] font-semibold ${view === 'board' ? 'bg-[var(--navy)] text-white' : 'text-[var(--ink-2)]'}`}>Board</Link>
          <Link href="/tickets?view=grid" role="tab" aria-selected={view === 'grid'}
            className={`px-3 py-1 text-[12.5px] font-semibold ${view === 'grid' ? 'bg-[var(--navy)] text-white' : 'text-[var(--ink-2)]'}`}>Grid</Link>
        </div>
        <Link href="/tickets/new" data-create className="btn btn-primary">+ New ticket</Link>
      </PageHeader>
      <Flash error={sp.error} ok={sp.ok} />
      {view === 'board'
        ? <TicketBoard tickets={rows} role={me.role} meId={me.id} zones={zones} />
        : <TicketsGrid rows={rows} canTriage={me.role !== 'dev'} people={people.filter((p) => p.active).map((p) => ({ value: p.id, label: p.name }))} />}
    </>
  )
}
