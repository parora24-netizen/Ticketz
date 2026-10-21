import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ADMIN_TABS, Tabs } from '@/components/tabs'
import { PageHeader } from '@/components/ui'
import { getMe } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { loadPeople } from '@/lib/data'
import { fmtDuration, sessionMinutes, type Session } from '@/lib/activity'

const ROLE = { lead: 'Lead', dev: 'Developer', qa: 'QA' } as const
const IST = 'Asia/Kolkata'
const when = (iso: string | null | undefined) => iso
  ? new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: IST })
  : '—'
const time = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: IST })

/** Who uses Launchpad: last sign-in, last seen, and time in the app today and this week. */
export default async function ActivityPage() {
  const me = await getMe()
  if (me.role !== 'lead') redirect('/')
  const supabase = await createClient()
  const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString()
  const [people, { data: signIns }, { data: sessions }] = await Promise.all([
    loadPeople(),
    supabase.rpc('last_sign_ins'),
    supabase.from('presence_sessions').select('person_id, started_at, last_at, pings, pages').gte('last_at', weekAgo).order('started_at', { ascending: false }).limit(1000),
  ])
  const list = (sessions ?? []) as Session[]
  const signInOf = new Map(((signIns ?? []) as { person_id: string; last_sign_in_at: string | null }[]).map((s) => [s.person_id, s.last_sign_in_at]))
  const todayIst = new Date().toLocaleDateString('en-CA', { timeZone: IST })
  const isToday = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: IST }) === todayIst
  const name = new Map(people.map((p) => [p.id, p.name]))

  const rows = people.filter((p) => p.active).map((p) => {
    const mine = list.filter((s) => s.person_id === p.id)
    return {
      ...p,
      signIn: signInOf.get(p.id) ?? null,
      lastSeen: mine.reduce<string | null>((m, s) => (!m || s.last_at > m ? s.last_at : m), null),
      today: mine.filter((s) => isToday(s.started_at)).reduce((n, s) => n + sessionMinutes(s), 0),
      week: mine.reduce((n, s) => n + sessionMinutes(s), 0),
      sessions: mine.length,
    }
  }).sort((a, b) => (b.lastSeen ?? '').localeCompare(a.lastSeen ?? ''))

  return (
    <>
      <Tabs items={ADMIN_TABS} active="activity" />
      <PageHeader sub="Time in the app counts while Launchpad is open in a visible tab. A break of 30 minutes starts a new session." />
      <section className="card overflow-x-auto">
        <table className="table">
          <thead><tr><th>Person</th><th>Role</th><th>Last sign-in</th><th>Last seen</th><th className="text-right">Today</th><th className="text-right">Last 7 days</th><th className="text-right">Sessions</th><th /></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="font-semibold">{r.name}</td>
                <td>{ROLE[r.role]}</td>
                <td className="whitespace-nowrap">{when(r.signIn)}</td>
                <td className="whitespace-nowrap">{r.lastSeen ? when(r.lastSeen) : <span className="text-[var(--faint)]">Not since tracking began</span>}</td>
                <td className="mono text-right">{r.today ? fmtDuration(r.today) : '—'}</td>
                <td className="mono text-right">{r.week ? fmtDuration(r.week) : '—'}</td>
                <td className="mono text-right">{r.sessions || '—'}</td>
                <td><Link href={`/admin/timeline?person=${r.id}`} className="text-[12px] text-[var(--accent)] hover:underline">Timeline</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="card mt-4 overflow-x-auto">
        <h2 className="px-4 pt-4 font-semibold">Recent sessions</h2>
        <table className="table mt-2">
          <thead><tr><th>Person</th><th>Day</th><th>From</th><th>To</th><th className="text-right">Time</th><th className="text-right">Pages</th></tr></thead>
          <tbody>
            {list.slice(0, 60).map((s) => (
              <tr key={`${s.person_id}${s.started_at}`}>
                <td><Link href={`/admin/timeline?person=${s.person_id}`} className="hover:underline">{name.get(s.person_id) ?? 'Someone'}</Link></td>
                <td className="whitespace-nowrap">{new Date(s.started_at).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: IST })}</td>
                <td className="mono">{time(s.started_at)}</td>
                <td className="mono">{time(s.last_at)}</td>
                <td className="mono text-right">{fmtDuration(sessionMinutes(s))}</td>
                <td className="mono text-right">{s.pages}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!list.length && <p className="p-6 text-center text-[13px] text-[var(--muted)]">No sessions yet. They appear once people use the app after this was switched on.</p>}
      </section>
    </>
  )
}
