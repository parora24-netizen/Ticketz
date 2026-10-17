import { Chip, Empty, PriorityChip, StateChip, TicketLink } from '@/components/ui'
import { fmtDate, type TicketRow } from '@/lib/data'

export function TicketTable({ rows, empty }: { rows: TicketRow[]; empty: string }) {
  return (
    <div className="card overflow-x-auto">
      <table className="table">
        <thead><tr><th>Ticket</th><th>Title</th><th>Severity</th><th>State</th><th>Owner</th><th>Area</th><th>Logged</th></tr></thead>
        <tbody>
          {rows.map((t) => (
            <tr key={t.id}>
              <td className="whitespace-nowrap"><TicketLink k={t.key} />{t.kind === 'test_mismatch' && <span className="ml-1"><Chip>Test</Chip></span>}</td>
              <td className="max-w-md">{t.title}</td>
              <td><PriorityChip p={t.severity} /></td>
              <td><StateChip s={t.state} /></td>
              <td>{t.owner_name ?? <span className="text-[var(--crit)]">Unowned</span>}</td>
              <td className="whitespace-nowrap text-xs">{t.zone ? `${t.zone} · ${t.page}` : '—'}</td>
              <td className="whitespace-nowrap">{fmtDate(t.logged_on)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && <Empty>{empty}</Empty>}
    </div>
  )
}
