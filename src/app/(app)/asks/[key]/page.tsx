import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Flash } from '@/components/flash'
import { CaseLink, Chip, PageHeader, TicketLink } from '@/components/ui'
import { getMe } from '@/lib/auth'
import { askJson, type AskRow } from '@/lib/asks-server'
import { KIND_LABEL } from '@/lib/automation-loop'
import { loadPeople } from '@/lib/data'
import { createClient } from '@/lib/supabase/server'
import { AskAnswer, AskOwnerDue } from './ask-controls'

/** One ask: what is asked, who owns it, the cases waiting, and the answer or decision. */
export default async function AskPage({ params, searchParams }: { params: Promise<{ key: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { key } = await params
  const sp = await searchParams
  const me = await getMe()
  const supabase = await createClient()
  const { data } = await supabase.from('asks').select('*').eq('key', decodeURIComponent(key).toUpperCase()).maybeSingle()
  if (!data) notFound()
  const [a] = await askJson(supabase, [data as AskRow])
  const people = (await loadPeople()).filter((p) => p.active).map((p) => p.name)
  return (
    <>
      <PageHeader title={a.title} sub={<><span className="mono">{a.key}</span> · {KIND_LABEL[a.kind]}{a.created_by ? ` · asked by ${a.created_by}` : ''} · {new Date(a.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })}</>}>
        <Chip tone={a.state === 'open' ? 'accent' : a.state === 'done' ? 'good' : 'muted'}>{a.status}</Chip>
      </PageHeader>
      <Flash error={sp.error} ok={sp.ok} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="card space-y-4 p-5 text-[13px]">
          {a.detail && <p className="whitespace-pre-wrap text-[var(--ink-2)]">{a.detail}</p>}
          {a.options?.length ? <div><h3 className="label">Options</h3><ul className="mt-1 list-disc pl-5">{a.options.map((o) => <li key={o}>{o}</li>)}</ul></div> : null}
          {a.state !== 'open' && (
            <div className="border border-[var(--line-soft)] bg-[var(--surface-3)] p-3">
              <h3 className="label">{a.status[0].toUpperCase() + a.status.slice(1)}{a.resolved_by ? ` by ${a.resolved_by}` : ''}</h3>
              {a.outcome && <p className="mt-1 font-semibold">Outcome: {a.outcome}</p>}
              {a.store && <p className="mt-1">Stored in <span className="mono">{a.store}</span></p>}
              {a.answer && <p className="mt-1 whitespace-pre-wrap">{a.answer}</p>}
            </div>
          )}
          <AskAnswer askKey={a.key} kind={a.kind} state={a.state} options={a.options ?? []} />
        </section>
        <aside className="space-y-4">
          <section className="card">
            <dl className="divide-y divide-[var(--row)] text-[13px]">
              <AskOwnerDue askKey={a.key} owner={a.owner} due={a.due_on} people={people} canEdit={a.state === 'open'} />
              {a.need_key && <div className="flex justify-between gap-3 px-4 py-2.5"><dt className="label">Need key</dt><dd className="mono">{a.need_key}</dd></div>}
              {a.ticket && <div className="flex justify-between gap-3 px-4 py-2.5"><dt className="label">Defect</dt><dd><TicketLink k={a.ticket} /></dd></div>}
            </dl>
          </section>
          <section className="card">
            <h3 className="border-b border-[var(--line)] px-4 py-2.5 text-[14px] font-semibold">{a.cases.length} case{a.cases.length === 1 ? '' : 's'} {a.state === 'open' ? 'waiting' : 'linked'}</h3>
            <ul className="flex max-h-80 flex-wrap gap-2 overflow-y-auto px-4 py-3">{a.cases.map((c) => <li key={c}><CaseLink tcId={c} /></li>)}</ul>
            {!a.cases.length && <p className="px-4 pb-3 text-[12px] text-[var(--muted)]">No cases linked.</p>}
          </section>
          {me.role === 'lead' && <p className="px-1 text-[12px]"><Link href="/asks?view=all" className="text-[var(--accent)] hover:underline">All asks</Link></p>}
        </aside>
      </div>
    </>
  )
}
