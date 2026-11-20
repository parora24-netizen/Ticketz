import Link from 'next/link'
import { redirect } from 'next/navigation'
import { CaseLink, Chip, PageHeader, PriorityChip, StateChip, TicketLink } from '@/components/ui'
import { casesByAnyId, currentTicketKey } from '@/lib/ids'
import { idFromSearch } from '@/lib/search-id'
import { createClient } from '@/lib/supabase/server'

/** Jump straight to an exact test case id, ticket key or ask; otherwise list title matches. */
export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = ((await searchParams).q ?? '').trim().slice(0, 100)
  if (!q) redirect('/')
  const supabase = await createClient()
  // "dev 648" or "tc 491" mean DEV-648 and TC_491.
  const up = idFromSearch(q)
  const [exactCase, exactTicket] = await Promise.all([casesByAnyId(supabase, [up]).then((m) => m.get(up)), currentTicketKey(supabase, up)])
  if (exactTicket) redirect(`/tickets/${encodeURIComponent(exactTicket)}`)
  if (/^ASK-\d+$/.test(up)) {
    const { data: ask } = await supabase.from('asks').select('key').eq('key', up).maybeSingle()
    if (ask) redirect(`/asks/${ask.key}`)
  }
  if (exactCase) redirect(`/cases/${encodeURIComponent(exactCase.tc_id)}`)

  // Characters that mean something in a PostgREST filter are dropped rather than escaped.
  const term = q.replace(/[%_,().*\\]/g, ' ').trim()
  const like = `%${term}%`
  const [{ data: cases }, { data: tickets }, { data: asks }] = await Promise.all([
    supabase.from('test_cases').select('tc_id, title, priority').or(`title.ilike.${like},tc_id.ilike.${like},legacy_tc_id.ilike.${like}`).limit(50),
    supabase.from('tickets').select('key, title, severity, state').or(`title.ilike.${like},key.ilike.${like},legacy_key.ilike.${like}`).limit(50),
    supabase.from('asks').select('key, title, state, owner:people!asks_owner_id_fkey(name)').or(`title.ilike.${like},key.ilike.${like},detail.ilike.${like}`).order('num', { ascending: false }).limit(50),
  ])
  return (
    <>
      <PageHeader sub={`Results for "${q}": ${tickets?.length ?? 0} ${tickets?.length === 1 ? 'ticket' : 'tickets'} · ${cases?.length ?? 0} test ${cases?.length === 1 ? 'case' : 'cases'} · ${asks?.length ?? 0} ${asks?.length === 1 ? 'ask' : 'asks'}`} />
      <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        <section className="card">
          <h2 className="border-b border-[var(--line)] px-4 py-2.5 text-[14px] font-semibold">Tickets</h2>
          <ul className="divide-y divide-[var(--row)]">
            {(tickets ?? []).map((t) => (
              <li key={t.key} className="flex items-center gap-3 px-4 py-2">
                <TicketLink k={t.key} />
                <span className="flex-1 truncate text-[12.5px]">{t.title}</span>
                <StateChip s={t.state} />
                <PriorityChip p={t.severity} />
              </li>
            ))}
            {!tickets?.length && <li className="px-4 py-3 text-[12.5px] text-[var(--muted)]">No tickets match.</li>}
          </ul>
        </section>
        <section className="card">
          <h2 className="border-b border-[var(--line)] px-4 py-2.5 text-[14px] font-semibold">Test cases</h2>
          <ul className="divide-y divide-[var(--row)]">
            {(cases ?? []).map((c) => (
              <li key={c.tc_id} className="flex items-center gap-3 px-4 py-2">
                <CaseLink tcId={c.tc_id} />
                <span className="flex-1 truncate text-[12.5px]">{c.title}</span>
                <PriorityChip p={c.priority} />
              </li>
            ))}
            {!cases?.length && (
              <li className="px-4 py-3 text-[12.5px] text-[var(--muted)]">
                No test cases match. <Link href="/cases" className="text-[var(--accent)] hover:underline">Open the grid</Link>
              </li>
            )}
          </ul>
        </section>
        <section className="card">
          <h2 className="border-b border-[var(--line)] px-4 py-2.5 text-[14px] font-semibold">Asks</h2>
          <ul className="divide-y divide-[var(--row)]">
            {(asks ?? []).map((a) => (
              <li key={a.key} className="flex items-center gap-3 px-4 py-2">
                <Link href={`/asks/${a.key}`} className="mono text-[12px] font-medium text-[var(--accent)] hover:underline">{a.key}</Link>
                <span className="flex-1 truncate text-[12.5px]">{a.title}</span>
                <span className="text-[11.5px] text-[var(--muted)]">{(a.owner as unknown as { name: string } | null)?.name ?? 'No owner'}</span>
                <Chip tone={a.state === 'open' ? 'accent' : a.state === 'done' ? 'good' : 'muted'}>{a.state === 'open' ? 'Open' : a.state === 'done' ? 'Done' : 'Declined'}</Chip>
              </li>
            ))}
            {!asks?.length && <li className="px-4 py-3 text-[12.5px] text-[var(--muted)]">No asks match.</li>}
          </ul>
        </section>
      </div>
    </>
  )
}
