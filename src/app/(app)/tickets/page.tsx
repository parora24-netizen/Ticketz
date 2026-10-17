import Link from 'next/link'
import { PageHeader } from '@/components/ui'
import { Flash } from '@/components/flash'
import { loadAreas, loadPeople, loadTickets } from '@/lib/data'
import { OPEN_STATES, STATE_LABEL, TICKET_STATES, type TicketState } from '@/lib/workflow/ticket-machine'
import { raiseTicket } from '../actions'
import { TicketTable } from './ticket-table'

const SEV_ORDER = { Critical: 0, High: 1, Medium: 2, Low: 3 }

export default async function TicketsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams
  const [tickets, people, areas] = await Promise.all([loadTickets(), loadPeople(), loadAreas()])
  const state = sp.state as TicketState | 'open' | undefined
  const rows = tickets
    .filter((t) =>
      (!state ? OPEN_STATES.includes(t.state) : state === 'open' ? OPEN_STATES.includes(t.state) : state === ('all' as string) ? true : t.state === state) &&
      (!sp.severity || t.severity === sp.severity) &&
      (!sp.owner || (sp.owner === 'none' ? !t.owner_id : t.owner_id === sp.owner)) &&
      (!sp.zone || t.zone === sp.zone) &&
      (!sp.kind || t.kind === sp.kind),
    )
    .sort((a, b) => SEV_ORDER[a.severity] - SEV_ORDER[b.severity] || a.key.localeCompare(b.key))
  const counts = new Map<TicketState, number>()
  for (const t of tickets) counts.set(t.state, (counts.get(t.state) ?? 0) + 1)
  const zones = [...new Set(areas.map((a) => a.zone))]

  return (
    <>
      <PageHeader title="Tickets" sub={`${rows.length} shown · ${tickets.filter((t) => OPEN_STATES.includes(t.state)).length} open of ${tickets.length}`} />
      <Flash error={sp.error} ok={sp.ok} />
      <div className="mb-3 flex flex-wrap gap-1.5 text-sm">
        <Link href="/tickets" className={`btn ${!state ? 'btn-primary' : ''}`}>Open</Link>
        {TICKET_STATES.map((s) => (
          <Link key={s} href={`/tickets?state=${s}`} className={`btn ${state === s ? 'btn-primary' : ''}`}>{STATE_LABEL[s]} <span className="tabular-nums opacity-70">{counts.get(s) ?? 0}</span></Link>
        ))}
        <Link href="/tickets?state=all" className={`btn ${state === ('all' as string) ? 'btn-primary' : ''}`}>All</Link>
      </div>
      <form className="card mb-4 grid gap-2 p-3 sm:grid-cols-5">
        {state && <input type="hidden" name="state" value={state} />}
        <select name="severity" defaultValue={sp.severity ?? ''} className="select">
          <option value="">Any severity</option>{['Critical', 'High', 'Medium', 'Low'].map((p) => <option key={p}>{p}</option>)}
        </select>
        <select name="owner" defaultValue={sp.owner ?? ''} className="select">
          <option value="">Any owner</option><option value="none">Unowned</option>
          {people.filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <select name="zone" defaultValue={sp.zone ?? ''} className="select">
          <option value="">Any zone</option>{zones.map((z) => <option key={z}>{z}</option>)}
        </select>
        <select name="kind" defaultValue={sp.kind ?? ''} className="select">
          <option value="">Defects and test issues</option><option value="defect">Product defects</option><option value="test_mismatch">Test issues</option>
        </select>
        <button className="btn btn-primary">Filter</button>
      </form>
      <TicketTable rows={rows} empty="No tickets match." />
      <details className="card mt-6 p-4">
        <summary className="cursor-pointer font-semibold">Raise a ticket not tied to a test case</summary>
        <form action={raiseTicket} className="mt-3 grid gap-2 sm:grid-cols-4">
          <input type="hidden" name="back" value="/tickets" />
          <input name="title" required placeholder="What is wrong" className="input sm:col-span-2" />
          <select name="severity" defaultValue="High" className="select">{['Critical', 'High', 'Medium', 'Low'].map((p) => <option key={p}>{p}</option>)}</select>
          <button className="btn btn-primary">Raise</button>
          <textarea name="description" rows={2} placeholder="Where, which build, steps" className="input sm:col-span-4" />
        </form>
      </details>
    </>
  )
}
