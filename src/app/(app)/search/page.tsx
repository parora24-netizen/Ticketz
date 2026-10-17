import Link from 'next/link'
import { redirect } from 'next/navigation'
import { CaseLink, PageHeader, PriorityChip, StateChip, TicketLink } from '@/components/ui'
import { createClient } from '@/lib/supabase/server'

/** Jump straight to an exact test case id or ticket key; otherwise list title matches. */
export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const q = ((await searchParams).q ?? '').trim().slice(0, 100)
  if (!q) redirect('/')
  const supabase = await createClient()
  const up = q.toUpperCase()
  const [{ data: exactCase }, { data: exactTicket }] = await Promise.all([
    supabase.from('test_cases').select('tc_id').eq('tc_id', up).maybeSingle(),
    supabase.from('tickets').select('key').eq('key', up).maybeSingle(),
  ])
  if (exactTicket) redirect(`/tickets/${encodeURIComponent(exactTicket.key)}`)
  if (exactCase) redirect(`/cases/${encodeURIComponent(exactCase.tc_id)}`)

  // Characters that mean something in a PostgREST filter are dropped rather than escaped.
  const term = q.replace(/[%_,().*\\]/g, ' ').trim()
  const like = `%${term}%`
  const [{ data: cases }, { data: tickets }] = await Promise.all([
    supabase.from('test_cases').select('tc_id, title, priority').or(`title.ilike.${like},tc_id.ilike.${like}`).limit(50),
    supabase.from('tickets').select('key, title, severity, state').or(`title.ilike.${like},key.ilike.${like}`).limit(50),
  ])
  return (
    <>
      <PageHeader sub={`Results for "${q}": ${tickets?.length ?? 0} ${tickets?.length === 1 ? 'ticket' : 'tickets'} · ${cases?.length ?? 0} test ${cases?.length === 1 ? 'case' : 'cases'}`} />
      <div className="grid gap-4 lg:grid-cols-2">
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
      </div>
    </>
  )
}
