import Link from 'next/link'
import { ASKS_TABS, Tabs } from '@/components/tabs'
import { Chip, PageHeader } from '@/components/ui'
import { Flash } from '@/components/flash'
import { getMe } from '@/lib/auth'
import { askJson, loadInbox, type AskRow } from '@/lib/asks-server'
import { createClient } from '@/lib/supabase/server'
import { AsksGrid } from './asks-grid'

const TYPE: Record<string, string> = { need: 'Need', question: 'Question', decision: 'Decision', retest: 'Retest', pr: 'Review', detail: 'Complete text', rewrite: 'Rewrite', approve: 'Approve', runner: 'Runner' }

/**
 * Asks: what someone has to do for testing and automation to go on. "Waiting on me" is one list of
 * everything that waits on you, soonest first; "All asks" shows what unblocks how many cases.
 */
export default async function AsksPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams
  const me = await getMe()
  const supabase = await createClient()
  const all = sp.view === 'all'
  const [items, asks] = await Promise.all([
    all ? Promise.resolve([]) : loadInbox(supabase, me),
    all ? supabase.from('asks').select('*').order('created_at', { ascending: false }).limit(1000).then(({ data }) => askJson(supabase, (data ?? []) as AskRow[])) : Promise.resolve([]),
  ])
  return (
    <>
      <Tabs items={ASKS_TABS} active={all ? 'all' : 'mine'} />
      <PageHeader sub={all ? 'Needs, questions and decisions, with the cases waiting on each.' : `What waits on you, ${me.name}: overdue first.`}>
        <Link href="/asks/new" data-create className="btn btn-primary">+ New ask</Link>
      </PageHeader>
      <Flash error={sp.error} ok={sp.ok} />
      {all ? <AsksGrid rows={asks} /> : (
        <section className="card">
          {items.length === 0
            ? <p className="px-4 py-6 text-center text-[13px] text-[var(--muted)]">Nothing waits on you.</p>
            : (
              <ul className="divide-y divide-[var(--row)]">
                {items.map((i, n) => (
                  <li key={n} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-[13px]">
                    <Chip tone={i.overdue ? 'crit' : 'muted'}>{TYPE[i.type] ?? i.type}</Chip>
                    <Link href={i.href} className="min-w-0 flex-1 font-medium text-[var(--accent)] hover:underline">{i.title}</Link>
                    {i.detail && <span className="text-[12px] text-[var(--muted)]">{i.detail}</span>}
                    {i.due_on && <span className={`mono text-[12px] ${i.overdue ? 'font-semibold text-[var(--crit)]' : 'text-[var(--muted)]'}`}>{i.overdue ? 'overdue · ' : 'due '}{i.due_on}</span>}
                  </li>
                ))}
              </ul>
            )}
        </section>
      )}
    </>
  )
}
