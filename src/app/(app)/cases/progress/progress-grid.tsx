'use client'

import Link from 'next/link'
import { DataGrid, type BulkField, type Column } from '@/components/grid/data-grid'
import type { ChartData } from '@/components/grid/grid-charts'
import { Bar, Chip } from '@/components/ui'
import { pageStatus, pct, type PageProgress } from '@/lib/progress'
import { updatePages } from './actions'

type Tone = 'good' | 'warn' | 'crit' | 'accent' | 'muted'
export type PageRow = PageProgress & { writer: string }
type Row = PageRow & { status_writing: string; status_automation: string; status_hand: string }

const ORDER = {
  writing: ['Completed', 'Writing', 'Late', 'Not started'],
  automation: ['Fully automated', 'Partly', 'Late', 'Not started', 'No cases'],
  hand: ['Done', 'In progress', 'Not started', 'Nothing to test'],
}
const TONE: Record<string, Tone> = {
  Completed: 'good', 'Fully automated': 'good', Done: 'good',
  Writing: 'accent', Partly: 'accent', 'In progress': 'accent',
  Late: 'crit',
}
const DOT: Record<Tone, string> = { good: 'bg-[var(--good)]', warn: 'bg-[var(--warn)]', crit: 'bg-[var(--crit)]', accent: 'bg-[var(--accent)]', muted: 'bg-[var(--line)]' }
const WRITING_EDIT = [{ value: 'done', label: 'Completed' }, { value: 'open', label: 'Not completed' }]

const fmt = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const days = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000)
const sum = (rows: Row[], k: 'cases' | 'automated' | 'autoPassed' | 'needManual' | 'manualDone' | 'manualPassed' | 'untested') => rows.reduce((s, r) => s + r[k], 0)

/**
 * Test cases progress as one grid of pages. The cards on top are the flow (① write, ② automate,
 * ③ test by hand, and who writes what); clicking a part of a card filters the grid to those pages.
 */
export function ProgressGrid({ pages, team, isLead, meId, today, mismatches, skipped }: {
  pages: PageRow[]
  team: { value: string; label: string }[]
  isLead: boolean
  meId: string
  today: string
  mismatches: number
  skipped: number
}) {
  const rows: Row[] = pages.map((p) => {
    const s = pageStatus(p)
    return { ...p, status_writing: s.writing, status_automation: s.automation, status_hand: s.hand }
  })
  const canMark = (r: Row) => (isLead || r.owner_id === meId) && (r.cases > 0 || r.writing === 'done')
  const due = (r: Row, d: string | null | undefined, late: boolean) =>
    d ? <span className={late ? 'font-semibold text-[var(--crit)]' : ''}>{fmt(d)}{late ? ' · late' : ''}</span>
      : <span className="text-[var(--faint)]">{isLead ? 'Set date' : '—'}</span>
  const lead = <E,>(e: E) => (isLead ? e : undefined)

  const cols: Column<Row>[] = [
    { key: 'zone', header: 'Zone', width: 130, value: (r) => r.zone },
    { key: 'page', header: 'Page', width: 170, value: (r) => r.page,
      render: (r) => <Link href={`/cases?area=${r.id}`} className="font-semibold text-[var(--accent)] hover:underline">{r.page}</Link> },
    { key: 'writer', header: 'Writer', width: 120, value: (r) => r.writer,
      edit: lead({ field: 'owner_id', kind: 'select' as const, options: [{ value: '__none', label: 'No one' }, ...team] }) },
    { key: 'writing', header: 'Writing', width: 130, value: (r) => r.status_writing,
      sortValue: (r) => ORDER.writing.indexOf(r.status_writing),
      render: (r) => <Chip tone={TONE[r.status_writing] ?? 'muted'}>{r.status_writing}</Chip>,
      edit: { field: 'writing', kind: 'select', options: WRITING_EDIT }, editable: canMark },
    { key: 'writingDate', header: 'Due / completed', width: 130, mono: true, value: (r) => (r.writing === 'done' ? r.cases_done_on : r.due_on) ?? '',
      render: (r) => r.writing === 'done' ? <span className="text-[var(--muted)]">done {fmt(r.cases_done_on!)}</span> : due(r, r.due_on, r.late),
      edit: lead({ field: 'due_on', kind: 'date' as const }), editable: (r) => r.writing !== 'done' },
    { key: 'cases', header: 'Cases', width: 70, align: 'right', value: (r) => r.cases },
    { key: 'automated', header: 'Automated', width: 170, value: (r) => pct(r.automated, r.cases), sortValue: (r) => (r.cases ? r.automated / r.cases : -1),
      render: (r) => r.cases ? <MiniBar n={r.automated} of={r.cases} parts={[{ value: r.autoPassed, tone: 'good', label: 'Passing' }, { value: r.automated - r.autoPassed, tone: 'warn', label: 'Not passing' }, { value: r.cases - r.automated, tone: 'muted', label: 'Not automated' }]} /> : null },
    { key: 'automation', header: 'Automation', width: 130, value: (r) => r.status_automation, sortValue: (r) => ORDER.automation.indexOf(r.status_automation),
      render: (r) => <Chip tone={TONE[r.status_automation] ?? 'muted'}>{r.status_automation}</Chip> },
    { key: 'automateDate', header: 'Automation due', width: 130, mono: true, value: (r) => r.automate_due_on ?? '',
      render: (r) => r.status_automation === 'Fully automated' ? <span className="text-[var(--faint)]">—</span> : due(r, r.automate_due_on, r.automateLate),
      edit: lead({ field: 'automate_due_on', kind: 'date' as const }), editable: (r) => r.status_automation !== 'Fully automated' },
    { key: 'manual', header: 'Tested by hand', width: 150, value: (r) => pct(r.manualDone, r.needManual), sortValue: (r) => (r.needManual ? r.manualDone / r.needManual : -1),
      render: (r) => r.needManual ? <MiniBar n={r.manualDone} of={r.needManual} parts={[{ value: r.manualPassed, tone: 'good', label: 'Passed' }, { value: r.manualDone - r.manualPassed, tone: 'crit', label: 'Not passed' }, { value: r.untested, tone: 'muted', label: 'Left' }]} /> : null },
    { key: 'hand', header: 'Hand testing', width: 120, value: (r) => r.status_hand, sortValue: (r) => ORDER.hand.indexOf(r.status_hand),
      render: (r) => <Chip tone={TONE[r.status_hand] ?? 'muted'}>{r.status_hand}</Chip> },
    { key: 'left', header: 'Left to test', width: 90, align: 'right', value: (r) => r.untested },
  ]

  const bulk: BulkField[] = [
    ...(isLead ? [
      { field: 'owner_id', label: 'Set writer', options: team },
      { field: 'due_on', label: 'Writing due', kind: 'date' as const },
      { field: 'automate_due_on', label: 'Automation due', kind: 'date' as const },
    ] : []),
    { field: 'writing', label: 'Writing', options: WRITING_EDIT },
  ]

  return (
    <DataGrid rows={rows} columns={cols} csvName="test-case-progress" searchPlaceholder="Search pages"
      selectable={isLead || rows.some((r) => r.owner_id === meId)}
      charts={[
        { key: 'writing', title: 'Writing', order: ORDER.writing },
        { key: 'automation', title: 'Automation', order: ORDER.automation },
        { key: 'hand', title: 'Hand testing', order: ORDER.hand },
        { key: 'writer', title: 'Writer' },
      ]}
      summary={(s) => <Cards {...s} today={today} mismatches={mismatches} skipped={skipped} />}
      bulkFields={bulk}
      onSave={(ids, patch) => {
        const p: Parameters<typeof updatePages>[1] = {}
        if ('owner_id' in patch) p.owner_id = patch.owner_id === '__none' ? null : patch.owner_id
        if ('due_on' in patch) p.due_on = patch.due_on
        if ('automate_due_on' in patch) p.automate_due_on = patch.automate_due_on
        if ('writing' in patch) p.done = patch.writing === 'done'
        return updatePages(ids, p)
      }}
      footerNote={isLead ? undefined : 'Writers can mark their own pages completed; the lead sets writers and dates.'} />
  )
}

function Cards({ charts, rowsFor, toggle, today, mismatches, skipped }: {
  charts: ChartData[]; rowsFor: (key: string) => Row[]; toggle: (key: string, value: string) => void; today: string; mismatches: number; skipped: number
}) {
  const chart = (key: string) => charts.find((c) => c.spec.key === key)!
  const w = rowsFor('writing'), a = rowsFor('automation'), h = rowsFor('hand'), byWriter = rowsFor('writer')
  const nextDue = w.filter((r) => r.writing !== 'done' && r.due_on).map((r) => r.due_on!).sort()[0]
  const [cases, automated, autoPassed] = [sum(a, 'cases'), sum(a, 'automated'), sum(a, 'autoPassed')]
  const [needManual, manualDone, manualPassed, untested] = [sum(h, 'needManual'), sum(h, 'manualDone'), sum(h, 'manualPassed'), sum(h, 'untested')]
  return (
    <section className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="The flow">
      <Card n="①" title="Write" value={`${w.filter((r) => r.writing === 'done').length} of ${w.length}`} unit="pages completed" chart={chart('writing')} toggle={toggle}
        line={`${sum(w, 'cases').toLocaleString()} cases${nextDue ? ` · due ${fmt(nextDue)} (${Math.max(days(today, nextDue), 0)} days)` : ''}`} />
      <Card n="②" title="Automate" value={`${pct(automated, cases)}%`} unit={`${automated.toLocaleString()} of ${cases.toLocaleString()} cases`} chart={chart('automation')} toggle={toggle}
        line={`${autoPassed.toLocaleString()} passing in their latest run (${pct(autoPassed, automated)}%)${skipped ? ` · ${skipped} skipped` : ''}`} />
      <Card n="③" title="Test by hand" value={`${pct(manualDone, needManual)}%`} unit={`${manualDone.toLocaleString()} of ${needManual.toLocaleString()} cases`} chart={chart('hand')} toggle={toggle}
        line={<>
          <Link href="/cases?stage=test" className="hover:underline">{untested.toLocaleString()} left</Link> · {pct(manualPassed, manualDone)}% passing
          {mismatches ? <> · <Link href="/cases?mismatch=1" className="text-[var(--warn)] hover:underline">{mismatches} disagree with automation</Link></> : null}
        </>} />
      <div className="card px-4 py-3">
        <div className="label">Writers</div>
        <ul className="mt-1.5 space-y-1">
          {chart('writer').bars.map((b) => {
            const mine = byWriter.filter((r) => (r.writer || '(blank)') === b.label)
            const done = mine.filter((r) => r.writing === 'done').length
            const on = chart('writer').selected.includes(b.label)
            return (
              <li key={b.label}>
                <button type="button" onClick={() => toggle('writer', b.label)} aria-pressed={on}
                  className={`w-full px-1.5 py-1 text-left text-[12.5px] ${on ? 'bg-[var(--accent-soft)] outline outline-1 outline-[var(--accent-line)]' : 'hover:bg-[var(--surface-3)]'}`}>
                  <span className="flex items-baseline justify-between gap-2">
                    <b className="font-semibold">{b.label === '(blank)' ? 'No writer' : b.label}</b>
                    <span className="text-[11.5px] text-[var(--muted)]">{done} of {mine.length} pages · {sum(mine, 'cases').toLocaleString()} cases</span>
                  </span>
                  <span className="mt-1 block"><Bar parts={[{ value: done, tone: 'good', label: 'Completed' }, { value: mine.length - done, tone: 'muted', label: 'To finish' }]} /></span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}

function Card({ n, title, value, unit, line, chart, toggle }: {
  n: string; title: string; value: string; unit: string; line: React.ReactNode; chart: ChartData; toggle: (key: string, value: string) => void
}) {
  const parts = chart.bars.map((b) => ({ value: b.count, tone: TONE[b.label] ?? 'muted', label: b.label }))
  return (
    <div className="card px-4 py-3">
      <div className="label">{n} {title}</div>
      <div className="mt-1.5 flex items-baseline gap-2">
        <span className="heading text-[26px] leading-none font-semibold text-[var(--navy-ink)] tabular-nums">{value}</span>
        <span className="text-[12.5px] text-[var(--muted)]">{unit}</span>
      </div>
      <div className="mt-2.5"><Bar parts={parts} /></div>
      <div className="mt-2 flex flex-wrap gap-1">
        {chart.bars.map((b) => {
          const on = chart.selected.includes(b.label)
          return (
            <button key={b.label} type="button" onClick={() => toggle(chart.spec.key, b.label)} aria-pressed={on}
              title={`Show only pages: ${b.label}. Click again to clear.`}
              className={`inline-flex h-6 items-center gap-1.5 border px-2 text-[11.5px] ${on ? 'border-[var(--navy)] bg-[var(--accent-soft)] font-semibold text-[var(--navy)]' : 'border-[var(--line)] bg-white text-[var(--ink-2)] hover:border-[var(--navy)]'}`}>
              <span className={`size-2 ${DOT[TONE[b.label] ?? 'muted']}`} />
              {b.label} <span className="tabular-nums text-[var(--muted)]">{b.count}</span>
            </button>
          )
        })}
      </div>
      <p className="mt-2 text-[12px] text-[var(--muted)]">{line}</p>
    </div>
  )
}

function MiniBar({ n, of, parts }: { n: number; of: number; parts: { value: number; tone: Tone; label: string }[] }) {
  return (
    <div>
      <div className="text-[11px] text-[var(--muted)] tabular-nums">{n} of {of} · {pct(n, of)}%</div>
      <div className="mt-1"><Bar parts={parts} /></div>
    </div>
  )
}
