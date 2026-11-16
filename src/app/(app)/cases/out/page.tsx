import Link from 'next/link'
import { CASES_TABS, Tabs } from '@/components/tabs'
import { Chip, PageHeader, PriorityChip } from '@/components/ui'
import { createClient } from '@/lib/supabase/server'

type Row = {
  tc_id: string; title: string; priority: 'Critical' | 'High' | 'Medium' | 'Low'; retired_at: string; retired_as: string | null; retired_reason: string | null
  areas: { zone: string; page: string } | { zone: string; page: string }[] | null; people: { name: string } | { name: string }[] | null
}
const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v)
const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' })

/** Cases taken out of the release: deferred to a later one, or retired for good. Open one to restore it. */
export default async function OutOfReleasePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams
  const show = sp.show === 'retired' || sp.show === 'deferred' ? sp.show : null
  const supabase = await createClient()
  const { data } = await supabase.from('test_cases')
    .select('tc_id, title, priority, retired_at, retired_as, retired_reason, areas(zone, page), people:retired_by(name)')
    .not('retired_at', 'is', null).order('retired_at', { ascending: false }).limit(1000)
  const all = (data ?? []) as unknown as Row[]
  const kindOf = (r: Row) => (r.retired_as === 'deferred' ? 'deferred' : 'retired')
  const rows = show ? all.filter((r) => kindOf(r) === show) : all
  const n = (k: string) => all.filter((r) => kindOf(r) === k).length
  return (
    <>
      <Tabs items={CASES_TABS} active="out" />
      <PageHeader sub="Cases out of this release. Deferred ones are expected back in a later release; retired ones no longer apply. Neither counts anywhere, and the runner skips them. Open a case to restore it.">
        {([[null, `All · ${all.length}`], ['deferred', `Deferred · ${n('deferred')}`], ['retired', `Retired · ${n('retired')}`]] as const).map(([k, label]) => (
          <Link key={label} href={k ? `/cases/out?show=${k}` : '/cases/out'} className={`btn ${show === k ? 'btn-primary' : ''}`}>{label}</Link>
        ))}
      </PageHeader>
      <section className="card overflow-x-auto">
        <table className="table w-full text-[12.5px]">
          <thead><tr><th>Case</th><th>Title</th><th>Page</th><th>Priority</th><th>Out as</th><th>Why</th><th>When</th><th>By</th></tr></thead>
          <tbody>
            {rows.map((r) => {
              const a = one(r.areas)
              return (
                <tr key={r.tc_id}>
                  <td><Link href={`/cases/${encodeURIComponent(r.tc_id)}`} className="mono font-medium text-[var(--accent)] hover:underline">{r.tc_id}</Link></td>
                  <td className="min-w-[220px]">{r.title}</td>
                  <td className="whitespace-nowrap">{a ? `${a.zone} · ${a.page}` : '—'}</td>
                  <td><PriorityChip p={r.priority} /></td>
                  <td><Chip tone={kindOf(r) === 'deferred' ? 'warn' : 'muted'}>{kindOf(r) === 'deferred' ? 'Deferred' : 'Retired'}</Chip></td>
                  <td className="min-w-[200px] text-[var(--muted)]">{r.retired_reason ?? '—'}</td>
                  <td className="whitespace-nowrap">{day(r.retired_at)}</td>
                  <td>{one(r.people)?.name ?? '—'}</td>
                </tr>
              )
            })}
            {!rows.length && <tr><td colSpan={8} className="text-[var(--muted)]">None.</td></tr>}
          </tbody>
        </table>
      </section>
    </>
  )
}
