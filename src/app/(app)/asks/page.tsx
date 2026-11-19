import Link from 'next/link'
import { ASKS_TABS, Tabs } from '@/components/tabs'
import { PageHeader } from '@/components/ui'
import { Flash } from '@/components/flash'
import { getMe } from '@/lib/auth'
import { askJson, loadInbox, type AskRow } from '@/lib/asks-server'
import { loadPeople } from '@/lib/data'
import { createClient } from '@/lib/supabase/server'
import { AsksGrid } from './asks-grid'
import { InboxGrid } from './inbox-grid'

/**
 * Asks: what someone has to do for testing and automation to go on. "Waiting on me" is one list of
 * everything that waits on you, soonest first; "All asks" shows what unblocks how many cases.
 */
export default async function AsksPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams
  const me = await getMe()
  const supabase = await createClient()
  const all = sp.view === 'all'
  const [items, asks, people] = await Promise.all([
    all ? Promise.resolve([]) : loadInbox(supabase, me),
    all ? supabase.from('asks').select('*').order('created_at', { ascending: false }).limit(1000).then(({ data }) => askJson(supabase, (data ?? []) as AskRow[])) : Promise.resolve([]),
    loadPeople(),
  ])
  return (
    <>
      <Tabs items={ASKS_TABS} active={all ? 'all' : 'mine'} />
      <PageHeader sub={all ? 'Needs, questions and decisions, with the cases waiting on each.' : `What waits on you, ${me.name}: overdue first.`}>
        <Link href="/asks/new" data-create className="btn btn-primary">+ New ask</Link>
      </PageHeader>
      <Flash error={sp.error} ok={sp.ok} />
      {all
        ? <AsksGrid rows={asks} people={people.filter((p) => p.active).map((p) => p.name)} />
        : <InboxGrid rows={items} />}
    </>
  )
}
