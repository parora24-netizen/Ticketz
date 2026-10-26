import Link from 'next/link'
import { PageHeader } from '@/components/ui'
import { Flash } from '@/components/flash'
import { TicketBoard } from '@/components/board/ticket-board'
import { getMe } from '@/lib/auth'
import { loadAreas, loadPeople, loadTickets, loadSprints } from '@/lib/data'
import { OPEN_STATES } from '@/lib/workflow/ticket-machine'
import { TicketsGrid } from './tickets-grid'

export default async function TicketsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams
  const view = sp.view === 'grid' ? 'grid' : 'board'
  const [me, allTickets, people, areas, sprints] = await Promise.all([getMe(), loadTickets(), loadPeople(), loadAreas(), loadSprints()])
  // Opened from a sprint (e.g. its open-ticket count): just that sprint's tickets.
  const scope = sp.sprint ? sprints.find((s) => s.id === sp.sprint) : undefined
  const tickets = scope ? allTickets.filter((t) => t.current_sprint_id === scope.id && OPEN_STATES.includes(t.state)) : allTickets
  const withScope = (href: string) => (scope ? `${href}${href.includes('?') ? '&' : '?'}sprint=${scope.id}` : href)
  const zones = [...new Set(areas.map((a) => a.zone))]
  const open = tickets.filter((t) => OPEN_STATES.includes(t.state)).length
  const unowned = tickets.filter((t) => OPEN_STATES.includes(t.state) && !t.owner_id).length
  const rows = tickets.map((t) => ({
    id: t.id, key: t.key, title: t.title, severity: t.severity, state: t.state, owner_id: t.owner_id, owner_name: t.owner_name,
    tc_id: t.tc_id, case_id: t.case_id, zone: t.zone, page: t.page, updated_at: t.updated_at, kind: t.kind, logged_on: t.logged_on, sprint_id: t.current_sprint_id,
  }))

  return (
    <>
      <PageHeader sub={scope
        ? <>Sprint {scope.name} · {open} open · {unowned} without an owner · <Link href={view === 'grid' ? '/tickets?view=grid' : '/tickets'} className="text-[var(--accent)] hover:underline">show all</Link></>
        : `${open} open · ${unowned} without an owner · ${tickets.length} in all`}>
        <div className="flex border border-[var(--line)] bg-white p-0.5" role="tablist" aria-label="View">
          <Link href={withScope('/tickets')} role="tab" aria-selected={view === 'board'}
            className={`px-3 py-1 text-[12.5px] font-semibold ${view === 'board' ? 'bg-[var(--navy)] text-white' : 'text-[var(--ink-2)]'}`}>Board</Link>
          <Link href={withScope('/tickets?view=grid')} role="tab" aria-selected={view === 'grid'}
            className={`px-3 py-1 text-[12.5px] font-semibold ${view === 'grid' ? 'bg-[var(--navy)] text-white' : 'text-[var(--ink-2)]'}`}>Grid</Link>
        </div>
        <Link href="/tickets/new" data-create className="btn btn-primary">+ New ticket</Link>
      </PageHeader>
      <Flash error={sp.error} ok={sp.ok} />
      {view === 'board'
        ? <TicketBoard tickets={rows} role={me.role} meId={me.id} zones={zones}
          people={people.filter((p) => p.active).map((p) => ({ id: p.id, name: p.name }))} sprints={sprints.filter((s) => s.status !== 'closed').map((s) => ({ id: s.id, name: s.name }))} />
        : <TicketsGrid rows={rows} sprints={sprints.filter((s) => s.status !== 'closed').map((s) => ({ value: s.id, label: s.name }))} state={sp.state} remember={!scope && !sp.state} canTriage={me.role !== 'dev'} isLead={me.role === 'lead'} people={people.filter((p) => p.active).map((p) => ({ value: p.id, label: p.name }))} />}
    </>
  )
}
