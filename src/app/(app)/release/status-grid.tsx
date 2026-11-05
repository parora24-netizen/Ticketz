'use client'

import Link from 'next/link'
import { DataGrid, type Column } from '@/components/grid/data-grid'
import type { ChartData } from '@/components/grid/grid-charts'
import { FilterCard, MiniBar, STATUS_TONE as TONE } from '@/components/grid/filter-cards'
import { Chip } from '@/components/ui'
import { sprintHref } from '@/lib/links'
import { pct, type Counts } from '@/lib/progress'

export type StatusRow = Counts & {
  id: string; zone: string; page: string; sprint: string; status: string; automation: string; hand: string
  open: number; critical: number; high: number; tickets: string
}
type N = 'cases' | 'automated' | 'autoRun' | 'autoPassed' | 'needManual' | 'manualDone' | 'manualPassed' | 'untested' | 'open' | 'critical' | 'high'

const ORDER = {
  status: ['Passing', 'Testing', 'Failures open', 'Critical/High open', 'No cases yet'],
  automation: ['Fully automated', 'Partly', 'Late', 'Not started', 'No cases'],
  hand: ['Done', 'In progress', 'Not started', 'Nothing to test'],
  tickets: ['None open', 'Others open', 'High open', 'Critical open'],
}
const sum = (rows: StatusRow[], k: N) => rows.reduce((s, r) => s + r[k], 0)
const none = <span className="text-[var(--faint)]">0</span>
/** Open tickets on a page, in the tickets grid, optionally of one severity. */
const ticketsHref = (r: StatusRow, severity?: string) => `/tickets?view=grid&area=${r.id}${severity ? `&severity=${severity}` : ''}`

/** Open tickets on no page of this release, which the grid has no row for but the totals count. */
type NoPage = { open: number; critical: number; high: number }

/**
 * Where the release stands, page by page: cases, automation and its results, manual testing and
 * its results, open tickets, and one status. The cards filter the grid; ticket counts open them.
 */
export function StatusGrid({ rows, noPage }: { rows: StatusRow[]; noPage: NoPage }) {
  const cols: Column<StatusRow>[] = [
    { key: 'zone', header: 'Zone', width: 130, value: (r) => r.zone },
    { key: 'page', header: 'Page', width: 160, value: (r) => r.page,
      render: (r) => <Link href={`/cases?area=${r.id}`} className="font-semibold text-[var(--accent)] hover:underline">{r.page}</Link> },
    { key: 'sprint', header: 'Sprint', width: 80, value: (r) => r.sprint,
      render: (r) => (r.sprint ? <Link href={sprintHref({ name: r.sprint })} className="text-[var(--accent)] hover:underline">{r.sprint}</Link> : <span className="text-[var(--faint)]">—</span>) },
    { key: 'status', header: 'Status', width: 150, value: (r) => r.status, sortValue: (r) => ORDER.status.indexOf(r.status),
      render: (r) => <Chip tone={TONE[r.status] ?? 'muted'}>{r.status}</Chip> },
    { key: 'cases', header: 'Cases', width: 70, align: 'right', value: (r) => r.cases },
    { key: 'automated', header: 'Automated', width: 150, value: (r) => pct(r.automated, r.cases), sortValue: (r) => (r.cases ? r.automated / r.cases : -1),
      render: (r) => r.cases ? <MiniBar n={r.automated} of={r.cases} parts={[{ value: r.automated, tone: 'accent', label: 'Automated' }, { value: r.cases - r.automated, tone: 'muted', label: 'Not automated' }]} /> : null },
    { key: 'autoRun', header: 'Automation passing', width: 150, value: (r) => pct(r.autoPassed, r.autoRun), sortValue: (r) => (r.autoRun ? r.autoPassed / r.autoRun : -1),
      render: (r) => r.automated ? <MiniBar n={r.autoPassed} of={r.autoRun} parts={[{ value: r.autoPassed, tone: 'good', label: 'Passing' }, { value: r.autoRun - r.autoPassed, tone: 'crit', label: 'Not passing' }, { value: r.automated - r.autoRun, tone: 'muted', label: 'Not run' }]} /> : null },
    { key: 'manual', header: 'Tested by hand', width: 150, value: (r) => pct(r.manualDone, r.needManual), sortValue: (r) => (r.needManual ? r.manualDone / r.needManual : -1),
      render: (r) => r.needManual ? <MiniBar n={r.manualDone} of={r.needManual} parts={[{ value: r.manualPassed, tone: 'good', label: 'Passed' }, { value: r.manualDone - r.manualPassed, tone: 'crit', label: 'Not passed' }, { value: r.untested, tone: 'muted', label: 'Left' }]} /> : null },
    { key: 'manualPassing', header: 'Hand passing', width: 100, align: 'right', value: (r) => (r.manualDone ? pct(r.manualPassed, r.manualDone) : null),
      render: (r) => r.manualDone ? `${pct(r.manualPassed, r.manualDone)}%` : <span className="text-[var(--faint)]">—</span> },
    { key: 'open', header: 'Open tickets', width: 100, align: 'right', value: (r) => r.open,
      render: (r) => r.open ? <Link href={ticketsHref(r)} className="font-semibold text-[var(--accent)] hover:underline">{r.open}</Link> : none },
    { key: 'critical', header: 'Critical', width: 80, align: 'right', value: (r) => r.critical,
      render: (r) => r.critical ? <Link href={ticketsHref(r, 'Critical')} className="font-semibold text-[var(--crit)] hover:underline">{r.critical}</Link> : none },
    { key: 'high', header: 'High', width: 70, align: 'right', value: (r) => r.high,
      render: (r) => r.high ? <Link href={ticketsHref(r, 'High')} className="font-semibold text-[var(--warn)] hover:underline">{r.high}</Link> : none },
    // Filter-only columns behind the cards.
    { key: 'automation', header: 'Automation', width: 120, value: (r) => r.automation, sortValue: (r) => ORDER.automation.indexOf(r.automation) },
    { key: 'hand', header: 'Hand testing', width: 120, value: (r) => r.hand, sortValue: (r) => ORDER.hand.indexOf(r.hand) },
    { key: 'tickets', header: 'Tickets', width: 110, value: (r) => r.tickets, sortValue: (r) => ORDER.tickets.indexOf(r.tickets) },
  ]
  return (
    <DataGrid rows={rows} columns={cols} csvName="release-status" searchPlaceholder="Search pages" selectable={false}
      charts={[
        { key: 'status', title: 'Status', order: ORDER.status },
        { key: 'automation', title: 'Automation', order: ORDER.automation },
        { key: 'hand', title: 'Hand testing', order: ORDER.hand },
        { key: 'tickets', title: 'Open tickets', order: ORDER.tickets },
      ]}
      summary={(s) => <Cards {...s} rows={rows} noPage={noPage} />} />
  )
}

function Cards({ charts, rowsFor, toggle, rows, noPage }: { charts: ChartData[]; rowsFor: (key: string) => StatusRow[]; toggle: (key: string, value: string) => void; rows: StatusRow[]; noPage: NoPage }) {
  const chart = (key: string) => charts.find((c) => c.spec.key === key)!
  const st = rowsFor('status'), a = rowsFor('automation'), h = rowsFor('hand'), t = rowsFor('tickets')
  const passing = st.filter((r) => r.status === 'Passing').length
  const [cases, automated, autoRun, autoPassed] = [sum(a, 'cases'), sum(a, 'automated'), sum(a, 'autoRun'), sum(a, 'autoPassed')]
  const [needManual, manualDone, manualPassed] = [sum(h, 'needManual'), sum(h, 'manualDone'), sum(h, 'manualPassed')]
  // Tickets with no page belong in the totals only while every page is showing.
  const extra = t.length === rows.length ? noPage : { open: 0, critical: 0, high: 0 }
  const [open, critical, high] = [sum(t, 'open') + extra.open, sum(t, 'critical') + extra.critical, sum(t, 'high') + extra.high]
  return (
    <section className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Status">
      <FilterCard label="Status" value={`${passing} of ${st.length}`} unit="pages passing" chart={chart('status')} toggle={toggle}
        line={`${sum(st, 'cases').toLocaleString()} cases`} />
      <FilterCard label="Automation" value={`${pct(automated, cases)}%`} unit={`${automated.toLocaleString()} of ${cases.toLocaleString()} automated`} chart={chart('automation')} toggle={toggle}
        line={`${autoRun.toLocaleString()} run · ${autoPassed.toLocaleString()} passing (${pct(autoPassed, autoRun)}%)`} />
      <FilterCard label="Tested by hand" value={`${pct(manualDone, needManual)}%`} unit={`${manualDone.toLocaleString()} of ${needManual.toLocaleString()} tested`} chart={chart('hand')} toggle={toggle}
        line={<><Link href="/cases?stage=test" className="hover:underline">{(needManual - manualDone).toLocaleString()} left</Link> · {pct(manualPassed, manualDone)}% passing</>} />
      <FilterCard label="Open tickets" value={open.toLocaleString()} unit="open" chart={chart('tickets')} toggle={toggle}
        line={<>
          <Link href="/tickets?view=grid&state=open&severity=Critical" className="font-semibold text-[var(--crit)] hover:underline">{critical} Critical</Link>
          {' · '}
          <Link href="/tickets?view=grid&state=open&severity=High" className="font-semibold text-[var(--warn)] hover:underline">{high} High</Link>
          {' · '}
          <Link href="/tickets?view=grid&state=open" className="hover:underline">all open</Link>
          {extra.open > 0 && ` · ${extra.open} with no page`}
        </>} />
    </section>
  )
}
