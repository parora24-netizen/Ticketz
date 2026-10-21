import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ADMIN_TABS, Tabs } from '@/components/tabs'
import { PageHeader } from '@/components/ui'
import { getMe } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { loadAreas, loadPeople, loadSprints } from '@/lib/data'
import { KIND_LABEL, byDay, changeEntries, moveEntries, sessionEntries, type ChangeRow, type Entry, type EntryKind, type Session, type TicketEventRow } from '@/lib/activity'
import { STATE_LABEL, type TicketState } from '@/lib/workflow/ticket-machine'

const DAYS = [1, 7, 30]
const KINDS = Object.keys(KIND_LABEL) as EntryKind[]
const KIND_TONE: Record<EntryKind, string> = {
  session: 'border-[var(--line)] bg-[var(--surface-2)] text-[var(--muted)]',
  edit: 'border-[var(--accent-line)] bg-[var(--accent-soft)] text-[var(--accent)]',
  move: 'border-[var(--navy)] bg-white text-[var(--navy-ink)]',
  comment: 'border-[var(--line)] bg-white text-[var(--ink-2)]',
  result: 'border-[var(--good-line)] bg-[var(--good-soft)] text-[var(--good)]',
}
const one = <T,>(v: T | T[] | null | undefined): T | null => (Array.isArray(v) ? v[0] ?? null : v ?? null)
const clip = (s: string, n = 140) => (s.length > n ? `${s.slice(0, n)}…` : s)

/** Everything that happened, newest first: edits, ticket moves, comments, manual results, sessions. */
export default async function TimelinePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const me = await getMe()
  if (me.role !== 'lead') redirect('/')
  const sp = await searchParams
  const days = DAYS.includes(Number(sp.days)) ? Number(sp.days) : 7
  const kind = KINDS.includes(sp.kind as EntryKind) ? (sp.kind as EntryKind) : ''
  const person = sp.person ?? ''
  const q = (sp.q ?? '').trim().toLowerCase()
  const since = new Date(Date.now() - days * 86_400_000).toISOString()

  const supabase = await createClient()
  const [people, areas, sprints, changes, events, comments, runs, sessions] = await Promise.all([
    loadPeople(), loadAreas(), loadSprints(),
    supabase.from('change_log').select('*').gte('at', since).order('at', { ascending: false }).limit(2000),
    supabase.from('ticket_events').select('id, from_state, to_state, note, actor_id, at, tickets(key)').gte('at', since).order('at', { ascending: false }).limit(2000),
    supabase.from('ticket_comments').select('id, body, author_id, created_at, tickets(key)').gte('created_at', since).order('created_at', { ascending: false }).limit(1000),
    supabase.from('test_runs').select('id, result, note, recorded_by, recorded_at, test_cases(tc_id)').eq('kind', 'manual').gte('recorded_at', since).order('recorded_at', { ascending: false }).limit(2000),
    supabase.from('presence_sessions').select('person_id, started_at, last_at, pings, pages').gte('started_at', since).limit(1000),
  ])
  const names = new Map<string, string>([
    ...people.map((p) => [p.id, p.name] as [string, string]),
    ...areas.map((a) => [a.id, `${a.zone} · ${a.page}`] as [string, string]),
    ...sprints.map((s) => [s.id, s.name] as [string, string]),
  ])
  const personName = (id: string | null) => (id ? names.get(id) ?? 'Someone' : 'System')

  const all: Entry[] = [
    ...changeEntries((changes.data ?? []) as ChangeRow[], names),
    ...moveEntries((events.data ?? []).flatMap((e) => {
      const key = one(e.tickets as { key: string } | { key: string }[] | null)?.key
      return key ? [{ ...e, key } as TicketEventRow] : []
    }), (s) => STATE_LABEL[s as TicketState] ?? s),
    ...(comments.data ?? []).map((c) => {
      const key = one(c.tickets as { key: string } | { key: string }[] | null)?.key ?? null
      return { key: `k${c.id}`, kind: 'comment' as const, at: c.created_at, actor_id: c.author_id, ref: key, href: key ? `/tickets/${encodeURIComponent(key)}` : null, what: 'commented', detail: clip(c.body, 300) }
    }),
    ...(runs.data ?? []).map((r) => {
      const tc = one(r.test_cases as { tc_id: string } | { tc_id: string }[] | null)?.tc_id ?? null
      return { key: `r${r.id}`, kind: 'result' as const, at: r.recorded_at, actor_id: r.recorded_by, ref: tc, href: tc ? `/cases/${encodeURIComponent(tc)}` : null, what: `recorded ${r.result}`, detail: r.note }
    }),
    ...sessionEntries((sessions.data ?? []) as Session[]),
  ]
  const shown = all.filter((e) => (!person || e.actor_id === person) && (!kind || e.kind === kind) && (!q || (e.ref ?? '').toLowerCase().includes(q)))
  const groups = byDay(shown)
  const counts = Object.fromEntries(KINDS.map((k) => [k, all.filter((e) => e.kind === k && (!person || e.actor_id === person)).length]))

  return (
    <>
      <Tabs items={ADMIN_TABS} active="timeline" />
      <PageHeader sub={`${shown.length} events in the last ${days === 1 ? 'day' : `${days} days`}. Field edits are recorded from 21 Oct.`} />
      <form className="mb-4 flex flex-wrap items-end gap-2">
        <label><span className="label">Person</span>
          <select name="person" defaultValue={person} className="select mt-1 block w-44">
            <option value="">Everyone</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </label>
        <label><span className="label">Kind</span>
          <select name="kind" defaultValue={kind} className="select mt-1 block w-44">
            <option value="">All kinds</option>
            {KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]} · {counts[k]}</option>)}
          </select>
        </label>
        <label><span className="label">Ticket, case or sprint</span>
          <input name="q" defaultValue={sp.q ?? ''} placeholder="e.g. TC_FN_070, DEV-, T1" className="input mt-1 block w-56" />
        </label>
        <label><span className="label">Period</span>
          <select name="days" defaultValue={String(days)} className="select mt-1 block w-36">
            {DAYS.map((d) => <option key={d} value={d}>{d === 1 ? 'Last day' : `Last ${d} days`}</option>)}
          </select>
        </label>
        <button className="btn btn-primary">Show</button>
        {(person || kind || q || days !== 7) && <Link href="/admin/timeline" className="btn">Clear</Link>}
      </form>

      {groups.map((g) => (
        <section key={g.day} className="mb-5">
          <h2 className="sticky top-14 z-10 bg-[var(--bg)] py-1.5 text-[13px] font-semibold text-[var(--navy-ink)]">{g.day} <span className="font-normal text-[var(--muted)]">· {g.entries.length}</span></h2>
          <ol className="card divide-y divide-[var(--line-soft)]">
            {g.entries.map((e) => (
              <li key={e.key} className="grid grid-cols-[52px_110px_minmax(0,1fr)] gap-3 px-4 py-2.5 text-[12.5px] max-sm:grid-cols-[44px_minmax(0,1fr)]">
                <span className="mono pt-0.5 text-[11.5px] text-[var(--muted)]">{new Date(e.at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })}</span>
                <Link href={`/admin/timeline?person=${e.actor_id ?? ''}&days=${days}`} className="truncate pt-0.5 font-semibold hover:underline max-sm:hidden">{personName(e.actor_id)}</Link>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                    <span className={`chip px-1.5 text-[10.5px] ${KIND_TONE[e.kind]}`}>{KIND_LABEL[e.kind]}</span>
                    <span className="sm:hidden font-semibold">{personName(e.actor_id)}</span>
                    <span>{e.what}</span>
                    {e.ref && (e.href ? <Link href={e.href} className="mono text-[12px] text-[var(--accent)] hover:underline">{e.ref}</Link> : <span className="mono text-[12px]">{e.ref}</span>)}
                  </div>
                  {e.fields && (
                    <ul className="mt-1 space-y-0.5 text-[12px]">
                      {e.fields.map((f) => (
                        <li key={f.field} className="flex flex-wrap gap-x-1.5">
                          <span className="text-[var(--muted)]">{f.field}:</span>
                          <span className="text-[var(--muted)] line-through decoration-[var(--faint)]" title={f.before}>{clip(f.before)}</span>
                          <span className="text-[var(--faint)]">→</span>
                          <span title={f.after}>{clip(f.after)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  {e.detail && <p className="mt-0.5 whitespace-pre-wrap text-[12px] text-[var(--muted)]">{e.detail}</p>}
                </div>
              </li>
            ))}
          </ol>
        </section>
      ))}
      {!groups.length && <p className="card p-8 text-center text-[13px] text-[var(--muted)]">Nothing happened in this period{person || kind || q ? ' with these filters' : ''}.</p>}
    </>
  )
}
