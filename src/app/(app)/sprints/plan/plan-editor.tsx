'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import { toast } from '@/components/toast'
import { savePlan } from './actions'

type Row = { id: string; zone: string; page: string; sprint_id: string | null; done_in: string; cases: number; tested: number }
type SprintOpt = { id: string; name: string; label: string }
type Dated = { id: string; name: string; kind: string; status: string; starts_on: string; ends_on: string }
const KIND: Record<string, string> = { triage: 'Triage', test: 'Test', fix: 'Fix', regression: 'Regression' }

/** Pages grouped by zone, each with a test-sprint picker; a zone's picker sets all its pages. Saves only what changed. */
export function PlanEditor({ rows, sprints, dated }: { rows: Row[]; sprints: SprintOpt[]; dated: Dated[] }) {
  const [dates, setDates] = useState<Record<string, { s: string; e: string }>>(() => Object.fromEntries(dated.map((d) => [d.id, { s: d.starts_on, e: d.ends_on }])))
  const datesChanged = dated.filter((d) => dates[d.id].s !== d.starts_on || dates[d.id].e !== d.ends_on)
  const badDates = datesChanged.filter((d) => dates[d.id].e < dates[d.id].s)
  const router = useRouter()
  const [plan, setPlan] = useState<Record<string, string>>(() => Object.fromEntries(rows.map((r) => [r.id, r.sprint_id ?? ''])))
  const [route, setRoute] = useState(true)
  const [pending, start] = useTransition()
  const zones = useMemo(() => [...new Set(rows.map((r) => r.zone))], [rows])
  const changed = rows.filter((r) => (plan[r.id] || null) !== r.sprint_id)
  const name = (id: string) => sprints.find((s) => s.id === id)?.name ?? 'Not planned'

  // Per sprint: pages and cases now planned, so the load is visible while editing.
  const load = sprints.map((s) => {
    const mine = rows.filter((r) => plan[r.id] === s.id)
    return { ...s, pages: mine.length, cases: mine.reduce((n, r) => n + r.cases, 0) }
  })
  const unplanned = rows.filter((r) => !plan[r.id])

  const select = (value: string, onChange: (v: string) => void, label: string, mixed = false) => (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} className="select h-8 w-56">
      {mixed && <option value="__mixed" disabled>Mixed</option>}
      <option value="">Not planned</option>
      {sprints.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
    </select>
  )

  return (
    <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
      <div className="space-y-3">
        <section className="card">
          <header className="border-b border-[var(--line)] bg-[var(--surface-3)] px-4 py-2">
            <h2 className="text-[14px] font-semibold text-[var(--navy-ink)]">Sprint dates</h2>
          </header>
          <div className="grid grid-cols-1 gap-x-6 sm:grid-cols-2">
            {dated.map((d) => {
              const v = dates[d.id]
              const moved = v.s !== d.starts_on || v.e !== d.ends_on
              return (
                <div key={d.id} className={`flex flex-wrap items-center gap-2 border-b border-[var(--row)] px-4 py-1.5 ${moved ? 'bg-[var(--accent-soft)]' : ''}`}>
                  <span className="w-10 text-[13px] font-semibold text-[var(--navy-ink)]">{d.name}</span>
                  <span className="w-20 text-[11.5px] text-[var(--muted)]">{KIND[d.kind] ?? d.kind}{d.status === 'active' ? ' · running' : ''}</span>
                  <input type="date" value={v.s} onChange={(e) => setDates((x) => ({ ...x, [d.id]: { ...x[d.id], s: e.target.value } }))} aria-label={`${d.name} starts`} className="input h-8 w-36" />
                  <span className="text-[12px] text-[var(--muted)]">to</span>
                  <input type="date" value={v.e} onChange={(e) => setDates((x) => ({ ...x, [d.id]: { ...x[d.id], e: e.target.value } }))} aria-label={`${d.name} ends`} className={`input h-8 w-36 ${v.e < v.s ? 'border-[var(--crit)]' : ''}`} />
                </div>
              )
            })}
          </div>
        </section>
        {zones.map((zone) => {
          const inZone = rows.filter((r) => r.zone === zone)
          const values = [...new Set(inZone.map((r) => plan[r.id]))]
          return (
            <section key={zone} className="card">
              <header className="flex flex-wrap items-center gap-3 border-b border-[var(--line)] bg-[var(--surface-3)] px-4 py-2">
                <h2 className="text-[14px] font-semibold text-[var(--navy-ink)]">{zone}</h2>
                <span className="text-[12px] text-[var(--muted)]">{inZone.length} pages · {inZone.reduce((n, r) => n + r.cases, 0)} cases</span>
                <span className="ml-auto flex items-center gap-2 text-[12px] text-[var(--muted)]">
                  Whole zone
                  {select(values.length === 1 ? values[0] : '__mixed', (v) => setPlan((p) => ({ ...p, ...Object.fromEntries(inZone.map((r) => [r.id, v])) })), `Sprint for all of ${zone}`, values.length > 1)}
                </span>
              </header>
              <ul className="divide-y divide-[var(--row)]">
                {inZone.map((r) => {
                  const moved = (plan[r.id] || null) !== r.sprint_id
                  return (
                    <li key={r.id} className={`flex flex-wrap items-center gap-3 px-4 py-1.5 ${moved ? 'bg-[var(--accent-soft)]' : ''}`}>
                      <Link href={`/cases?area=${r.id}`} className="min-w-40 flex-1 text-[13px] font-medium text-[var(--accent)] hover:underline">{r.page}</Link>
                      <span className="w-36 text-[12px] text-[var(--muted)]">{r.cases ? `${r.cases} cases · ${r.tested} tested` : 'No cases yet'}</span>
                      <span className="w-24 text-[11.5px] text-[var(--faint)]">{r.done_in ? `Done in ${r.done_in}` : ''}</span>
                      {select(plan[r.id], (v) => setPlan((p) => ({ ...p, [r.id]: v })), `Sprint for ${zone} · ${r.page}`)}
                      <span className="w-20 text-right text-[11.5px] font-semibold text-[var(--accent)]">{moved ? `was ${r.sprint_id ? name(r.sprint_id) : 'none'}` : ''}</span>
                    </li>
                  )
                })}
              </ul>
            </section>
          )
        })}
      </div>

      <aside className="space-y-3 xl:sticky xl:top-20 xl:self-start">
        <section className="card p-4">
          <h2 className="text-[14px] font-semibold text-[var(--navy-ink)]">Load per sprint</h2>
          <ul className="mt-2 space-y-1 text-[12.5px]">
            {load.map((s) => (
              <li key={s.id} className="flex justify-between gap-2"><span>{s.label.split(' · ').slice(0, 2).join(' · ')}</span><span className="mono text-[var(--muted)]">{s.pages} pages · {s.cases} cases</span></li>
            ))}
            <li className="flex justify-between gap-2 border-t border-[var(--line-soft)] pt-1"><span>Not planned</span><span className="mono text-[var(--muted)]">{unplanned.length} pages · {unplanned.reduce((n, r) => n + r.cases, 0)} cases</span></li>
          </ul>
        </section>
        <section className="card space-y-3 p-4">
          <p className="text-[13px]">{changed.length || datesChanged.length
            ? <>{datesChanged.length > 0 && <><b>{datesChanged.length}</b> sprint{datesChanged.length === 1 ? '' : 's'} re-dated{changed.length ? ', ' : ''}</>}{changed.length > 0 && <><b>{changed.length}</b> page{changed.length === 1 ? '' : 's'} changed</>}</>
            : 'No changes yet'}</p>
          {badDates.length > 0 && <p className="text-[12px] font-semibold text-[var(--crit)]">{badDates.map((d) => d.name).join(', ')} would end before {badDates.length === 1 ? 'it starts' : 'they start'}.</p>}
          {datesChanged.length > 0 && (
            <ul className="space-y-0.5 text-[12px] text-[var(--ink-2)]">
              {datesChanged.map((d) => <li key={d.id}>{d.name}: <b>{dates[d.id].s} to {dates[d.id].e}</b></li>)}
            </ul>
          )}
          {changed.length > 0 && (
            <ul className="max-h-48 space-y-0.5 overflow-auto text-[12px] text-[var(--ink-2)]">
              {changed.map((r) => <li key={r.id}>{r.zone} · {r.page}: {r.sprint_id ? name(r.sprint_id) : 'none'} → <b>{plan[r.id] ? name(plan[r.id]) : 'none'}</b></li>)}
            </ul>
          )}
          <label className="flex items-start gap-2 text-[12.5px]">
            <input type="checkbox" checked={route} onChange={(e) => setRoute(e.target.checked)} className="mt-0.5" />
            <span>Move these pages&apos; Medium and Low tickets to the fix sprint after their new test sprint<span className="block text-[11.5px] text-[var(--muted)]">Critical and High stay where they are; so does work in a running sprint.</span></span>
          </label>
          <div className="flex gap-2">
            <button type="button" disabled={(!changed.length && !datesChanged.length) || badDates.length > 0 || pending} className="btn btn-primary"
              onClick={() => start(async () => {
                const res = await savePlan({ changes: changed.map((r) => ({ area_id: r.id, sprint_id: plan[r.id] || null })), dates: datesChanged.map((d) => ({ sprint_id: d.id, starts_on: dates[d.id].s, ends_on: dates[d.id].e })), route_tickets: route })
                if (res.error) toast(res.error, 'error')
                else { toast(res.summary ?? 'Plan saved'); router.refresh() }
              })}>{pending ? 'Saving…' : 'Save plan'}</button>
            <button type="button" disabled={(!changed.length && !datesChanged.length) || pending} className="btn" onClick={() => { setPlan(Object.fromEntries(rows.map((r) => [r.id, r.sprint_id ?? '']))); setDates(Object.fromEntries(dated.map((d) => [d.id, { s: d.starts_on, e: d.ends_on }]))) }}>Undo changes</button>
          </div>
          <p className="text-[11.5px] text-[var(--muted)]">Recorded in the schedule log. Closed sprints and regression keep their pages.</p>
        </section>
      </aside>
    </div>
  )
}
