import Link from 'next/link'
import { Fragment } from 'react'
import { Bar, Chip, PageHeader } from '@/components/ui'
import { CASES_TABS, Tabs } from '@/components/tabs'
import { DueDate, WriterSelect, WrittenButton } from '@/components/progress-controls'
import { getMe } from '@/lib/auth'
import { daysUntil, fmtDate, loadAreas, loadCases, loadPeople } from '@/lib/data'
import { WRITING_LABEL, count, pageProgress, pct, type PageProgress } from '@/lib/progress'
import { mismatch } from '@/lib/workflow/case-stage'

const TONE = { done: 'good', writing: 'accent', not_started: 'muted' } as const

/**
 * Where test cases stand, as the workbook's Dashboard tells it: ① write the cases (by page, by
 * writer, against the due date), ② automate them, ③ test by hand what automation does not cover.
 */
export default async function ProgressPage() {
  const [me, areas, cases, people] = await Promise.all([getMe(), loadAreas(), loadCases(), loadPeople()])
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10)
  const pages = pageProgress(areas, cases, today)
  const inRelease = new Set(pages.map((p) => p.id))
  const all = count(cases.filter((c) => inRelease.has(c.area_id)))
  const name = new Map(people.map((p) => [p.id, p.name]))
  const written = pages.filter((p) => p.writing === 'done').length
  const due = pages.map((p) => p.due_on).filter((d): d is string => !!d && pages.some((p) => p.writing !== 'done' && p.due_on === d)).sort()[0]
  const isLead = me.role === 'lead'
  const team = people.filter((p) => p.active && p.role !== 'dev').map((p) => ({ value: p.id, label: p.name }))

  // Writing, by person
  const writers = [...new Set(pages.map((p) => p.owner_id ?? ''))].map((id) => {
    const mine = pages.filter((p) => (p.owner_id ?? '') === id)
    return { id, name: id ? name.get(id) ?? 'Someone' : 'No writer', pages: mine.length, done: mine.filter((p) => p.writing === 'done').length, cases: mine.reduce((s, p) => s + p.cases, 0) }
  }).sort((a, b) => b.pages - a.pages)

  // Follow-ups, as on the Dashboard
  const notStarted = pages.filter((p) => p.writing === 'not_started')
  const late = pages.filter((p) => p.late)
  const skipped = cases.filter((c) => c.auto_result === 'skipped').length
  const mismatches = cases.filter((c) => mismatch(c.auto_result, c.manual_result)).length
  const follow = [
    late.length && { text: `${late.length} page${late.length > 1 ? 's are' : ' is'} past the writing date`, detail: late.map((p) => `${p.zone} · ${p.page}`).join(', '), tone: 'crit' as const },
    notStarted.length && { text: `${notStarted.length} page${notStarted.length > 1 ? 's have' : ' has'} no cases yet`, detail: notStarted.map((p) => `${p.zone} · ${p.page}`).join(', '), tone: 'warn' as const },
    all.untested && { text: `${all.untested} cases still need a manual test`, detail: 'Critical/High cases, cases not automated, and cases automation did not pass.', href: '/cases?stage=test', tone: 'accent' as const },
    mismatches && { text: `${mismatches} cases where automation and manual testing disagree`, detail: 'Either the automated test misses what a person catches, or a known defect is fixed.', href: '/cases?mismatch=1', tone: 'warn' as const },
    skipped && { text: `${skipped} automated tests were skipped in their latest run`, detail: 'Skipped tests give no signal; confirm whether they should run.', tone: 'muted' as const },
  ].filter(Boolean) as { text: string; detail: string; href?: string; tone: 'crit' | 'warn' | 'accent' | 'muted' }[]

  const zones = [...new Set(pages.map((p) => p.zone))]
  return (
    <>
      <Tabs items={CASES_TABS} active="progress" />
      <PageHeader sub={`${all.cases.toLocaleString()} cases across ${pages.length} pages · as of ${fmtDate(today)}`} />

      <section className="grid gap-3 lg:grid-cols-3" aria-label="The flow">
        <FlowStep n="①" title="Write" value={`${written} of ${pages.length}`} unit="pages completed"
          line={`${all.cases.toLocaleString()} cases${due ? ` · due ${fmtDate(due)} (${Math.max(daysUntil(due), 0)} days)` : ''}`}
          parts={[{ value: written, tone: 'good', label: 'Completed' }, { value: pages.length - written - notStarted.length, tone: 'accent', label: 'Writing' }, { value: notStarted.length, tone: 'muted', label: 'Not started' }]} />
        <FlowStep n="②" title="Automate" value={`${pct(all.automated, all.cases)}%`} unit={`${all.automated.toLocaleString()} of ${all.cases.toLocaleString()} automated`}
          line={`${all.autoPassed.toLocaleString()} passing in their latest run (${pct(all.autoPassed, all.automated)}%)`}
          parts={[{ value: all.autoPassed, tone: 'good', label: 'Automated, passing' }, { value: all.automated - all.autoPassed, tone: 'warn', label: 'Automated, not passing' }, { value: all.cases - all.automated, tone: 'muted', label: 'Not automated' }]} />
        <FlowStep n="③" title="Test by hand" value={`${pct(all.manualDone, all.needManual)}%`} unit={`${all.manualDone.toLocaleString()} of ${all.needManual.toLocaleString()} tested`}
          line={`${all.untested.toLocaleString()} left · ${pct(all.manualPassed, all.manualDone)}% passing`}
          parts={[{ value: all.manualPassed, tone: 'good', label: 'Passed' }, { value: all.manualDone - all.manualPassed, tone: 'crit', label: 'Not passed' }, { value: all.untested, tone: 'muted', label: 'Left' }]} />
      </section>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="card min-w-0">
          <header className="flex items-baseline justify-between gap-3 border-b border-[var(--line)] px-4 py-2.5">
            <h2 className="text-[14px] font-semibold text-[var(--navy-ink)]">Pages</h2>
            <span className="text-[12px] text-[var(--muted)]">Open a page to see its cases</span>
          </header>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-[12.5px]">
              <thead className="text-left text-[11px] tracking-wide text-[var(--muted)] uppercase">
                <tr className="border-b border-[var(--line)]">
                  <th className="px-4 py-2 font-medium">Page</th>
                  <th className="px-2 py-2 font-medium">Writer</th>
                  <th className="px-2 py-2 font-medium">Writing</th>
                  <th className="px-2 py-2 text-right font-medium">Cases</th>
                  <th className="px-2 py-2 font-medium">Automated</th>
                  <th className="px-2 py-2 font-medium">Tested by hand</th>
                  <th className="px-2 py-2 text-right font-medium">Left</th>
                  <th className="px-4 py-2" />
                </tr>
              </thead>
              <tbody>
                {zones.map((z) => (
                  <Fragment key={z}>
                    <tr className="bg-[var(--surface-3)]"><th colSpan={8} className="px-4 py-1.5 text-left text-[12px] font-semibold text-[var(--navy-ink)]">{z}</th></tr>
                    {pages.filter((p) => p.zone === z).map((p) => <PageRow key={p.id} p={p} owner={p.owner_id ? name.get(p.owner_id) ?? null : null}
                      isLead={isLead} canMark={isLead || p.owner_id === me.id} team={team} />)}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="space-y-4">
          <section className="card">
            <h2 className="border-b border-[var(--line)] px-4 py-2.5 text-[14px] font-semibold text-[var(--navy-ink)]">Writing, by person</h2>
            <ul className="divide-y divide-[var(--line-soft)]">
              {writers.map((w) => (
                <li key={w.id} className="px-4 py-2.5 text-[12.5px]">
                  <div className="flex items-baseline justify-between gap-2">
                    <b className="font-semibold">{w.name}</b>
                    <span className="text-[var(--muted)]">{w.done} of {w.pages} pages · {w.cases.toLocaleString()} cases</span>
                  </div>
                  <div className="mt-1.5"><Bar parts={[{ value: w.done, tone: 'good', label: 'Completed' }, { value: w.pages - w.done, tone: 'muted', label: 'To finish' }]} /></div>
                </li>
              ))}
            </ul>
          </section>
          <section className="card">
            <h2 className="border-b border-[var(--line)] px-4 py-2.5 text-[14px] font-semibold text-[var(--navy-ink)]">Follow-ups</h2>
            <ul className="divide-y divide-[var(--line-soft)]">
              {follow.map((f) => (
                <li key={f.text} className="px-4 py-2.5 text-[12.5px]">
                  <p className="font-semibold">{f.href ? <Link href={f.href} className="hover:underline">{f.text}</Link> : f.text}</p>
                  <p className="mt-0.5 text-[12px] text-[var(--muted)]">{f.detail}</p>
                </li>
              ))}
              {!follow.length && <li className="px-4 py-4 text-[12.5px] text-[var(--muted)]">Nothing to follow up.</li>}
            </ul>
          </section>
        </aside>
      </div>
    </>
  )
}

function FlowStep({ n, title, value, unit, line, parts }: { n: string; title: string; value: string; unit: string; line: string; parts: Parameters<typeof Bar>[0]['parts'] }) {
  return (
    <div className="card px-4 py-3">
      <div className="label">{n} {title}</div>
      <div className="mt-1.5 flex items-baseline gap-2">
        <span className="heading text-[26px] leading-none font-semibold text-[var(--navy-ink)] tabular-nums">{value}</span>
        <span className="text-[12.5px] text-[var(--muted)]">{unit}</span>
      </div>
      <div className="mt-2.5"><Bar parts={parts} /></div>
      <p className="mt-2 text-[12px] text-[var(--muted)]">{line}</p>
    </div>
  )
}

function PageRow({ p, owner, isLead, canMark, team }: { p: PageProgress; owner: string | null; isLead: boolean; canMark: boolean; team: { value: string; label: string }[] }) {
  return (
    <tr className="border-b border-[var(--line-soft)] align-middle">
      <td className="px-4 py-2"><Link href={`/cases?area=${p.id}`} className="font-medium text-[var(--accent)] hover:underline">{p.page}</Link></td>
      <td className="px-2 py-2">
        {isLead ? <WriterSelect areaId={p.id} ownerId={p.owner_id ?? null} people={team} /> : owner ?? <span className="text-[var(--faint)]">No one</span>}
      </td>
      <td className="px-2 py-2 whitespace-nowrap">
        <Chip tone={p.late ? 'crit' : TONE[p.writing]}>{WRITING_LABEL[p.writing]}</Chip>
        <span className="ml-1.5 text-[11.5px] text-[var(--muted)]">
          {p.writing === 'done' ? fmtDate(p.cases_done_on!)
            : isLead ? <DueDate areaId={p.id} dueOn={p.due_on ?? null} />
            : p.due_on ? `due ${fmtDate(p.due_on)}` : ''}
        </span>
      </td>
      <td className="px-2 py-2 text-right tabular-nums">{p.cases || <span className="text-[var(--faint)]">0</span>}</td>
      <td className="w-[130px] px-2 py-2">{p.cases ? <MiniBar n={p.automated} of={p.cases} parts={[{ value: p.autoPassed, tone: 'good', label: 'Passing' }, { value: p.automated - p.autoPassed, tone: 'warn', label: 'Not passing' }, { value: p.cases - p.automated, tone: 'muted', label: 'Not automated' }]} /> : null}</td>
      <td className="w-[130px] px-2 py-2">{p.needManual ? <MiniBar n={p.manualDone} of={p.needManual} parts={[{ value: p.manualPassed, tone: 'good', label: 'Passed' }, { value: p.manualDone - p.manualPassed, tone: 'crit', label: 'Not passed' }, { value: p.untested, tone: 'muted', label: 'Left' }]} /> : null}</td>
      <td className="px-2 py-2 text-right tabular-nums">{p.untested || <span className="text-[var(--faint)]">0</span>}</td>
      <td className="px-4 py-2 text-right">{canMark && (p.cases > 0 || p.writing === 'done') && <WrittenButton areaId={p.id} done={p.writing === 'done'} page={p.page} />}</td>
    </tr>
  )
}

function MiniBar({ n, of, parts }: { n: number; of: number; parts: Parameters<typeof Bar>[0]['parts'] }) {
  return (
    <div>
      <div className="text-[11px] text-[var(--muted)] tabular-nums">{n} of {of} · {pct(n, of)}%</div>
      <div className="mt-1"><Bar parts={parts} /></div>
    </div>
  )
}
