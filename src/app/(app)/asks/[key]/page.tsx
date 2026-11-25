import Link from '@/components/link'
import { notFound } from 'next/navigation'
import { Flash } from '@/components/flash'
import { CaseLink, Chip, PageHeader, TicketLink } from '@/components/ui'
import { getMe } from '@/lib/auth'
import { askJson, suiteOwnerId, type AskRow } from '@/lib/asks-server'
import { KIND_LABEL, askDisplay, type AskState } from '@/lib/automation-loop'
import { loadPeople } from '@/lib/data'
import { createClient } from '@/lib/supabase/server'
import { ListNav } from '@/components/list-nav'
import { AskActions, AskDiscussion, AskOwnerDue, AskVerdict, SuiteDone, type AskCase } from './ask-controls'

const when = (at: string) => new Date(at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })

/** One ask: what is asked, what the owner will do about it, the discussion, and the cases waiting. */
export default async function AskPage({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { key } = await params
  const sp = await searchParams
  const me = await getMe()
  const supabase = await createClient()
  const { data } = await supabase.from('asks').select('*').eq('key', decodeURIComponent(key).toUpperCase()).maybeSingle()
  if (!data) notFound()
  const row = data as AskRow
  const [[a], allPeople, { data: open }, { data: thread }, { data: links }, suiteOwner] = await Promise.all([
    askJson(supabase, [row]),
    loadPeople(),
    // Without a list to come from: every open ask, newest first.
    supabase.from('asks').select('key').eq('state', 'open').order('created_at', { ascending: false }).limit(1000),
    supabase.from('ask_comments').select('id, body, created_at, people(name)').eq('ask_id', row.id).order('created_at'),
    supabase.from('ask_cases').select('test_cases(tc_id, title, text_updated_at, retired_at, retired_as)').eq('ask_id', row.id),
    suiteOwnerId(supabase),
  ])
  const people = allPeople.filter((p) => p.active).map((p) => p.name)
  const suiteOwnerName = allPeople.find((p) => p.id === suiteOwner)?.name ?? null
  const fallback = (open ?? []).map((o) => o.key as string)
  type Linked = { tc_id: string; title: string; text_updated_at: string; retired_at: string | null; retired_as: string | null }
  const cases: AskCase[] = (links ?? []).map((l) => (Array.isArray(l.test_cases) ? l.test_cases[0] : l.test_cases) as Linked | null).filter((c): c is Linked => !!c)
    .map((c) => ({ tc_id: c.tc_id, title: c.title, edited: c.text_updated_at > row.created_at, out: c.retired_at ? c.retired_as ?? 'retired' : null }))
    .sort((x, y) => x.tc_id.localeCompare(y.tc_id, undefined, { numeric: true }))
  const comments = (thread ?? []).map((c) => ({ id: c.id as string, body: c.body as string, at: when(c.created_at as string), who: (Array.isArray(c.people) ? c.people[0] : c.people as { name: string } | null)?.name ?? 'Someone' }))
  const isOpen = a.state === 'open'
  const shown = askDisplay(a.kind, a.state as AskState, a.outcome, a.suite_need)
  return (
    <>
      <ListNav name="asks" current={a.key} fallback={fallback.includes(a.key) ? fallback : [a.key, ...fallback]} fallbackFrom="open asks" base="/asks" noun="ask" />
      <PageHeader title={a.title} sub={<><span className="mono">{a.key}</span> · {KIND_LABEL[a.kind]}{a.created_by ? ` · asked by ${a.created_by}` : ''} · {new Date(a.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })}</>}>
        <Chip tone={isOpen ? 'accent' : a.state === 'answered' ? 'good' : 'muted'}>{shown.state}</Chip>
        {shown.outcome && <Chip tone={isOpen ? 'warn' : 'muted'}>{shown.outcome}</Chip>}
      </PageHeader>
      <Flash error={sp.error} ok={sp.ok} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-4">
          {(a.detail || a.options?.length || !isOpen) && (
            <section className="card space-y-4 p-5 text-[13px]">
              {a.detail && <p className="whitespace-pre-wrap text-[var(--ink-2)]">{a.detail}</p>}
              {a.options?.length ? <div><h3 className="label">Options</h3><ul className="mt-1 list-disc pl-5">{a.options.map((o) => <li key={o}>{o}</li>)}</ul></div> : null}
              {!isOpen && (
                <div className={`border p-3 ${a.state === 'answered' ? 'border-[var(--good-line)] bg-[var(--good-soft)]' : 'border-[var(--line-soft)] bg-[var(--surface-3)]'}`}>
                  <h3 className="label">Answered · {shown.outcome}{a.resolved_by ? ` by ${a.resolved_by}` : ''}{a.resolved_at ? `, ${when(a.resolved_at)}` : ''}</h3>
                  {a.duplicate_of && <p className="mt-1">Covered by <Link href={`/asks/${a.duplicate_of}`} className="mono text-[var(--accent)] hover:underline">{a.duplicate_of}</Link></p>}
                  {a.store && <p className="mt-1">Stored in <span className="mono">{a.store}</span></p>}
                  {a.answer && <p className="mt-1 whitespace-pre-wrap">{a.answer}</p>}
                  <p className="mt-2 text-[12px] text-[var(--muted)]">
                    {a.state === 'closed'
                      ? `Closed${a.closed_by ? ` by ${a.closed_by}` : ''}${a.closed_at ? `, ${when(a.closed_at)}` : ''}.`
                      : `Waiting for ${a.created_by === me.name ? 'you' : a.created_by ?? 'whoever raised it'} to check it: close it, or send it back to ${a.owner ?? 'its owner'} saying why.`}
                  </p>
                  {(a.created_by === me.name || me.role === 'lead') && <AskVerdict askKey={a.key} state={a.state as 'answered' | 'closed'} owner={a.owner} />}
                </div>
              )}
            </section>
          )}
          {isOpen && a.suite_need && (
            <section className="card flex items-start justify-between gap-3 border-l-4 border-l-[var(--warn)] p-4 text-[13px]">
              <div>
                <h3 className="font-semibold">Waiting on a suite change{a.owner ? `, with ${a.owner}` : ''}</h3>
                <p className="mt-1 whitespace-pre-wrap text-[var(--ink-2)]">{a.suite_need}</p>
                <p className="mt-1 text-[12px] text-[var(--muted)]">The cases are right; the e2e suite cannot do this yet. Close it once it can, and the runner tries them again.</p>
              </div>
              <SuiteDone askKey={a.key} need={a.suite_need} />
            </section>
          )}
          {isOpen && a.handed_from && (
            <section className="card border-l-4 border-l-[var(--accent)] p-4 text-[13px]">
              <b className="font-semibold">{a.handed_from}</b> handed this to <b className="font-semibold">{a.owner ?? 'someone'}</b> until they reply. When {a.owner === me.name ? 'you reply' : `${a.owner ?? 'they'} replies`} below, it goes back to {a.handed_from}.
            </section>
          )}
          {isOpen && <AskActions askKey={a.key} kind={a.kind} cases={cases} suiteOwner={suiteOwnerName} suiteNeed={a.suite_need} />}
          <AskDiscussion askKey={a.key} comments={comments} people={people} open={isOpen} me={me.name} owner={a.owner} handedFrom={a.handed_from} />
        </div>
        <aside className="space-y-4">
          <section className="card">
            <dl className="divide-y divide-[var(--row)] text-[13px]">
              <AskOwnerDue askKey={a.key} owner={a.owner} due={a.due_on} people={people} canEdit={isOpen} />
              {a.need_key && <div className="flex justify-between gap-3 px-4 py-2.5"><dt className="label">Need key</dt><dd className="mono">{a.need_key}</dd></div>}
              {a.ticket && <div className="flex justify-between gap-3 px-4 py-2.5"><dt className="label">Defect</dt><dd><TicketLink k={a.ticket} /></dd></div>}
            </dl>
          </section>
          <section className="card">
            <h3 className="border-b border-[var(--line)] px-4 py-2.5 text-[14px] font-semibold">{cases.length} case{cases.length === 1 ? '' : 's'} {isOpen ? 'waiting' : 'linked'}</h3>
            {cases.length > 0 && (
              <ul className="max-h-96 divide-y divide-[var(--row)] overflow-y-auto">
                {cases.map((c) => (
                  <li key={c.tc_id} className="flex items-center gap-2 px-4 py-1.5 text-[12.5px]">
                    <CaseLink tcId={c.tc_id} />
                    <span className="min-w-0 flex-1 truncate text-[var(--muted)]" title={c.title}>{c.title}</span>
                    {c.out ? <span className="shrink-0 text-[11.5px] text-[var(--faint)]">{c.out === 'deferred' ? 'Deferred' : 'Retired'}</span>
                      : isOpen && c.edited ? <span className="shrink-0 text-[11.5px] font-medium text-[var(--good)]">Edited</span> : null}
                  </li>
                ))}
              </ul>
            )}
            {!cases.length && <p className="px-4 py-3 text-[12px] text-[var(--muted)]">No cases linked.</p>}
          </section>
          {me.role === 'lead' && <p className="px-1 text-[12px]"><Link href="/asks?view=all" className="text-[var(--accent)] hover:underline">All asks</Link></p>}
        </aside>
      </div>
    </>
  )
}
