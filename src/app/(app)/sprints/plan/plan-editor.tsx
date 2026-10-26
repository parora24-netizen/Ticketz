'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useMemo, useState, useTransition } from 'react'
import { toast } from '@/components/toast'
import { fixSprintAfter } from '@/lib/workflow/fix-sprint'
import { savePlan, setZoneInRelease } from './actions'

type Row = { id: string; zone: string; page: string; sprint_id: string | null; done_in: string; cases: number; tested: number }
type SprintOpt = { id: string; name: string; label: string }
type Dated = { id: string; name: string; kind: string; status: string; starts_on: string; ends_on: string }

const DAY = 864e5
const shift = (d: string, days: number) => new Date(Date.parse(`${d}T00:00:00Z`) + days * DAY).toISOString().slice(0, 10)
const short = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
const weekdays = (s: string, e: string) => {
  let n = 0
  for (let t = Date.parse(`${s}T00:00:00Z`); t <= Date.parse(`${e}T00:00:00Z`); t += DAY) if (![0, 6].includes(new Date(t).getUTCDay())) n++
  return n
}

/**
 * The plan in one place. Top: dates, a row per week with the test and fix sprints side by side;
 * "+1 week" moves that week and every week after it. Below: a grid of every page against the test
 * sprints; click a cell to put the page in that sprint, or a zone's cell to move the whole zone.
 * Nothing saves until Save plan.
 */
export function PlanEditor({ rows, outZones = [], sprints, dated, goNoGo }: { rows: Row[]; outZones?: { zone: string; pages: number }[]; sprints: SprintOpt[]; dated: Dated[]; goNoGo: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [route, setRoute] = useState(true)
  const [plan, setPlan] = useState<Record<string, string>>(() => Object.fromEntries(rows.map((r) => [r.id, r.sprint_id ?? ''])))
  const [dates, setDates] = useState<Record<string, { s: string; e: string }>>(() => Object.fromEntries(dated.map((d) => [d.id, { s: d.starts_on, e: d.ends_on }])))

  // Weeks: T1 with F1, T2 with F2, … then anything else (regression) on its own row.
  const weeks = useMemo(() => {
    const num = (n: string) => (/^[TF]\d+$/.test(n) ? Number(n.slice(1)) : null)
    const m = new Map<string, { test?: Dated; fix?: Dated; other?: Dated }>()
    for (const d of dated) {
      const n = num(d.name)
      const key = n === null ? `x${d.name}` : `n${String(n).padStart(3, '0')}`
      const w = m.get(key) ?? {}
      if (n === null) w.other = d
      else if (d.name.startsWith('T')) w.test = d
      else w.fix = d
      m.set(key, w)
    }
    return [...m.values()].sort((a, b) => {
      const sa = (a.test ?? a.fix ?? a.other)!, sb = (b.test ?? b.fix ?? b.other)!
      return sa.starts_on.localeCompare(sb.starts_on) || sa.name.localeCompare(sb.name)
    })
  }, [dated])

  const moveFrom = (i: number, days: number) => setDates((x) => {
    const next = { ...x }
    for (const w of weeks.slice(i)) for (const d of [w.test, w.fix, w.other]) if (d) next[d.id] = { s: shift(next[d.id].s, days), e: shift(next[d.id].e, days) }
    return next
  })

  const changedPages = rows.filter((r) => (plan[r.id] || null) !== r.sprint_id)
  const changedDates = dated.filter((d) => dates[d.id].s !== d.starts_on || dates[d.id].e !== d.ends_on)
  const badDates = changedDates.filter((d) => dates[d.id].e < dates[d.id].s)
  const dirty = changedPages.length + changedDates.length > 0
  // Sprints now running past go/no-go: the release date would need to move too (Release page).
  const pastGoNoGo = dated.filter((d) => dates[d.id].e > goNoGo)

  const zones = useMemo(() => [...new Set(rows.map((r) => r.zone))], [rows])
  const cols = [...sprints].sort((a, b) => (dates[a.id]?.s ?? '').localeCompare(dates[b.id]?.s ?? ''))
  const load = (sid: string) => { const mine = rows.filter((r) => (plan[r.id] || '') === sid); return { pages: mine.length, cases: mine.reduce((n, r) => n + r.cases, 0) } }
  const sname = (id: string | null) => (id ? sprints.find((s) => s.id === id)?.name ?? '?' : 'not planned')
  // A page tested in Tn is fixed in F(n+1): its failures' tickets go there.
  const fixOf = (testId: string) => fixSprintAfter(dated.find((d) => d.id === testId), dated)

  function save() {
    start(async () => {
      const res = await savePlan({
        changes: changedPages.map((r) => ({ area_id: r.id, sprint_id: plan[r.id] || null })),
        dates: changedDates.map((d) => ({ sprint_id: d.id, starts_on: dates[d.id].s, ends_on: dates[d.id].e })),
        route_tickets: route,
      })
      if (res.error) toast(res.error, 'error')
      else { toast(res.summary ?? 'Plan saved'); router.refresh() }
    })
  }
  function inRelease(zone: string, on: boolean) {
    if (!on && !window.confirm(`Leave ${zone} out of this release? It leaves the plan until you add it back; its pages and cases stay.`)) return
    start(async () => {
      const res = await setZoneInRelease(zone, on)
      if (res.error) toast(res.error, 'error')
      else { toast(on ? `${zone} is back in the plan` : `${zone} left out of this release`); router.refresh() }
    })
  }
  function undo() {
    setPlan(Object.fromEntries(rows.map((r) => [r.id, r.sprint_id ?? ''])))
    setDates(Object.fromEntries(dated.map((d) => [d.id, { s: d.starts_on, e: d.ends_on }])))
  }

  const dateCell = (d: Dated | undefined) => {
    if (!d) return <td className="px-2 py-1.5 text-[12px] text-[var(--faint)]">—</td>
    const v = dates[d.id]
    const moved = v.s !== d.starts_on || v.e !== d.ends_on
    return (
      <td className={`px-2 py-1.5 ${moved ? 'bg-[var(--accent-soft)]' : ''}`}>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="w-7 text-[13px] font-semibold text-[var(--navy-ink)]">{d.name}</span>
          <input type="date" value={v.s} onChange={(e) => setDates((x) => ({ ...x, [d.id]: { ...x[d.id], s: e.target.value } }))} aria-label={`${d.name} starts`} className="input h-7 w-[8.5rem] px-1.5 text-[12px]" />
          <span className="text-[11px] text-[var(--muted)]">to</span>
          <input type="date" value={v.e} onChange={(e) => setDates((x) => ({ ...x, [d.id]: { ...x[d.id], e: e.target.value } }))} aria-label={`${d.name} ends`} className={`input h-7 w-[8.5rem] px-1.5 text-[12px] ${v.e < v.s ? 'border-[var(--crit)]' : ''}`} />
          <span className="text-[11px] text-[var(--muted)]">{v.e < v.s ? 'ends before it starts' : `${weekdays(v.s, v.e)} days`}{d.status === 'active' ? ' · running' : ''}</span>
        </div>
      </td>
    )
  }

  const Cell = ({ on, partial, onClick, label }: { on: boolean; partial?: boolean; onClick: () => void; label: string }) => (
    <button type="button" onClick={onClick} aria-pressed={on} aria-label={label} title={label}
      className={`mx-auto flex h-6 w-6 items-center justify-center rounded-full border transition-colors ${on ? 'border-[var(--navy)] bg-[var(--navy)] text-white' : partial ? 'border-[var(--navy)] bg-[var(--accent-soft)]' : 'border-[var(--line)] bg-white hover:border-[var(--navy)]'}`}>
      {on ? <span className="text-[11px]">✓</span> : partial ? <span className="h-2 w-2 rounded-full bg-[var(--navy)]" /> : null}
    </button>
  )

  return (
    <div className="pb-24">
      <section className="card mb-4">
        <header className="flex items-baseline gap-3 border-b border-[var(--line)] bg-[var(--surface-3)] px-4 py-2">
          <h2 className="text-[14px] font-semibold text-[var(--navy-ink)]">Dates</h2>
          <span className="text-[12px] text-[var(--muted)]">Test and fix sprints run side by side. +1 week moves that week and every week after it.</span>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] border-collapse">
            <thead><tr className="text-left text-[11px] font-semibold text-[var(--muted)]"><th className="px-2 py-1.5">Test</th><th className="px-2 py-1.5">Fix</th><th className="w-36" /></tr></thead>
            <tbody className="divide-y divide-[var(--row)]">
              {weeks.map((w, i) => (
                <tr key={i}>
                  {w.other ? <>{dateCell(w.other)}<td /></> : <>{dateCell(w.test)}{dateCell(w.fix)}</>}
                  <td className="px-2 py-1.5 text-right whitespace-nowrap">
                    <button type="button" onClick={() => moveFrom(i, -7)} className="btn btn-sm" title="Move this week and later ones a week earlier">−1 week</button>
                    <button type="button" onClick={() => moveFrom(i, 7)} className="btn btn-sm ml-1" title="Move this week and later ones a week later">+1 week</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card">
        <header className="flex items-baseline gap-3 border-b border-[var(--line)] bg-[var(--surface-3)] px-4 py-2">
          <h2 className="text-[14px] font-semibold text-[var(--navy-ink)]">Pages</h2>
          <span className="text-[12px] text-[var(--muted)]">Click a cell to test that page in that sprint; click a zone&apos;s cell to move the whole zone. A page tested in a sprint is fixed in the fix sprint after it.</span>
        </header>
        {/* Sideways scroll only on narrow screens: inside a scroll box the sticky headings would
            stop sticking to the page. The table is as wide as it needs, so each page's cells sit
            next to its name rather than across an empty stretch. */}
        <div className="max-lg:overflow-x-auto">
          <table className="w-max min-w-[760px] border-collapse text-[13px]">
            <thead className="sticky top-14 z-10 bg-white shadow-[0_1px_0_var(--line)]">
              <tr className="border-b border-[var(--line)]">
                <th className="sticky left-0 z-10 min-w-[300px] bg-white px-4 py-2 text-left text-[11px] font-semibold text-[var(--muted)]">Zone · page</th>
                {cols.map((s) => {
                  const l = load(s.id)
                  return (
                    <th key={s.id} className="w-36 px-2 py-2 text-center whitespace-nowrap">
                      <div className="text-[13px] font-semibold text-[var(--navy-ink)]">{s.name}</div>
                      <div className="text-[11px] font-normal text-[var(--muted)]">{short(dates[s.id]?.s ?? '')}–{short(dates[s.id]?.e ?? '')}</div>
                      <div className="mono text-[10.5px] font-normal text-[var(--faint)]">{l.pages} pages · {l.cases} cases</div>
                      <div className="mt-0.5 text-[11px] font-semibold text-[var(--accent)]">{fixOf(s.id) ? `fixed in ${fixOf(s.id)!.name}` : 'no fix sprint after it'}</div>
                    </th>
                  )
                })}
                <th className="w-28 px-2 py-2 text-center whitespace-nowrap">
                  <div className="text-[13px] font-semibold text-[var(--navy-ink)]">Not planned</div>
                  <div className="mono text-[10.5px] font-normal text-[var(--faint)]">{load('').pages} pages</div>
                </th>
              </tr>
            </thead>
            <tbody>
              {zones.map((zone) => {
                const inZone = rows.filter((r) => r.zone === zone)
                const count = (sid: string) => inZone.filter((r) => (plan[r.id] || '') === sid).length
                const setZone = (sid: string) => setPlan((p) => ({ ...p, ...Object.fromEntries(inZone.map((r) => [r.id, sid])) }))
                return [
                  <tr key={zone} className="border-t border-[var(--line)] bg-[var(--surface-3)]">
                    <td className="sticky left-0 bg-[var(--surface-3)] px-4 py-1.5"><b className="text-[var(--navy-ink)]">{zone}</b> <span className="text-[12px] text-[var(--muted)]">{inZone.length} pages · {inZone.reduce((n, r) => n + r.cases, 0)} cases</span>
                      {inZone.every((r) => !r.sprint_id && !plan[r.id]) && (
                        <button type="button" disabled={pending} onClick={() => inRelease(zone, false)} className="ml-2 text-[11.5px] text-[var(--accent)] hover:underline">Leave out of this release</button>
                      )}
                    </td>
                    {[...cols.map((s) => s.id), ''].map((sid) => {
                      const n = count(sid)
                      return <td key={sid || 'none'} className="py-1.5"><Cell on={n === inZone.length} partial={n > 0 && n < inZone.length} onClick={() => setZone(sid)} label={`All of ${zone} in ${sname(sid || null)}`} /></td>
                    })}
                  </tr>,
                  ...inZone.map((r) => {
                    const moved = (plan[r.id] || null) !== r.sprint_id
                    return (
                      <tr key={r.id} className={`border-t border-[var(--row)] ${moved ? 'bg-[var(--accent-soft)]' : 'hover:bg-[var(--surface-3)]'}`}>
                        <td className={`sticky left-0 py-1 pr-2 pl-8 ${moved ? 'bg-[var(--accent-soft)]' : 'bg-white'}`}>
                          <Link href={`/cases?area=${r.id}`} className="font-medium text-[var(--accent)] hover:underline">{r.page}</Link>
                          <span className="ml-2 text-[11.5px] text-[var(--muted)]">{r.cases ? `${r.cases} cases, ${r.tested} tested` : 'no cases yet'}{r.done_in ? ` · done in ${r.done_in}` : ''}</span>
                          {moved && <span className="ml-2 text-[11px] font-semibold text-[var(--accent)]">was {sname(r.sprint_id)}</span>}
                        </td>
                        {[...cols.map((s) => s.id), ''].map((sid) => (
                          <td key={sid || 'none'} className="py-1"><Cell on={(plan[r.id] || '') === sid} onClick={() => setPlan((p) => ({ ...p, [r.id]: sid }))} label={`${zone} · ${r.page} in ${sname(sid || null)}`} /></td>
                        ))}
                      </tr>
                    )
                  }),
                ]
              })}
            </tbody>
          </table>
        </div>
        {outZones.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-[var(--line)] bg-[var(--surface-3)] px-4 py-2 text-[12.5px]">
            <span className="text-[var(--muted)]">Not in this release:</span>
            {outZones.map((z) => (
              <span key={z.zone}>
                <b className="text-[var(--navy-ink)]">{z.zone}</b> <span className="text-[var(--muted)]">{z.pages} pages</span>
                <button type="button" disabled={pending} onClick={() => inRelease(z.zone, true)} className="ml-1.5 text-[var(--accent)] hover:underline">Add back</button>
              </span>
            ))}
          </div>
        )}
      </section>

      {/* Always in reach while scrolling a long plan. */}
      <div className="fixed right-0 bottom-0 left-0 z-30 border-t border-[var(--line)] bg-white/95 px-4 py-2.5 shadow-[0_-8px_24px_rgba(15,27,51,.08)] backdrop-blur md:left-[216px] md:px-6">
        <div className="flex flex-wrap items-center gap-3 text-[13px]">
          <span className="min-w-0">
            {dirty
              ? <><b>{[changedDates.length && `${changedDates.length} sprint${changedDates.length === 1 ? '' : 's'} re-dated`, changedPages.length && `${changedPages.length} page${changedPages.length === 1 ? '' : 's'} moved`].filter(Boolean).join(' · ')}</b>
                {changedPages.length > 0 && <span className="ml-2 text-[12px] text-[var(--muted)]">{changedPages.slice(0, 3).map((r) => `${r.page} → ${sname(plan[r.id] || null)}`).join(', ')}{changedPages.length > 3 ? ', …' : ''}</span>}</>
              : <span className="text-[var(--muted)]">No changes. Edit dates or click cells, then save.</span>}
            {pastGoNoGo.length > 0 && <span className="ml-2 font-semibold text-[var(--warn)]">{pastGoNoGo.map((d) => d.name).join(', ')} end{pastGoNoGo.length === 1 ? 's' : ''} after go/no-go ({short(goNoGo)}); move the release on the Release page</span>}
            {badDates.length > 0 && <span className="ml-2 font-semibold text-[var(--crit)]">{badDates.map((d) => d.name).join(', ')} end{badDates.length === 1 ? 's' : ''} before {badDates.length === 1 ? 'it starts' : 'they start'}</span>}
          </span>
          <label className="ml-auto flex items-center gap-2 text-[12.5px]" title="Critical and High tickets, and work in a running sprint, stay where they are.">
            <input type="checkbox" checked={route} onChange={(e) => setRoute(e.target.checked)} />
            Move moved pages&apos; Medium/Low tickets to the matching fix sprint
          </label>
          <button type="button" onClick={undo} disabled={!dirty || pending} className="btn">Undo</button>
          <button type="button" onClick={save} disabled={!dirty || badDates.length > 0 || pending} className="btn btn-primary">{pending ? 'Saving…' : 'Save plan'}</button>
        </div>
      </div>
    </div>
  )
}
