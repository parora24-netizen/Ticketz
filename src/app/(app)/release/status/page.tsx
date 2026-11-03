import { RELEASE_TABS, Tabs } from '@/components/tabs'
import { PageHeader } from '@/components/ui'
import { HEALTH_LABEL, summarizeArea } from '@/lib/areas'
import { fmtDate, loadAreas, loadCases, loadTickets } from '@/lib/data'
import { pageProgress, pageStatus } from '@/lib/progress'
import { OPEN_STATES } from '@/lib/workflow/ticket-machine'
import { StatusGrid, type StatusRow } from './status-grid'

/** The release's status page by page: what is written, automated, tested, passing and still open. */
export default async function StatusPage() {
  const [areas, cases, tickets] = await Promise.all([loadAreas(), loadCases(), loadTickets()])
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10)
  const rows: StatusRow[] = pageProgress(areas, cases, today).map((p) => {
    const mine = tickets.filter((t) => t.area_id === p.id)
    const open = mine.filter((t) => OPEN_STATES.includes(t.state))
    const critical = open.filter((t) => t.severity === 'Critical').length
    const high = open.filter((t) => t.severity === 'High').length
    const s = pageStatus(p)
    return {
      ...p, id: p.id, zone: p.zone, page: p.page,
      status: HEALTH_LABEL[summarizeArea(cases.filter((c) => c.area_id === p.id), mine).health],
      automation: s.automation, hand: s.hand,
      open: open.length, critical, high,
      tickets: critical ? 'Critical open' : high ? 'High open' : open.length ? 'Others open' : 'None open',
    }
  })
  return (
    <>
      <Tabs items={RELEASE_TABS} active="status" />
      <PageHeader sub={`${rows.length} pages in 26.111 · as of ${fmtDate(today)} · click a part of a card to filter, a ticket count to open those tickets`} />
      <StatusGrid rows={rows} />
    </>
  )
}
