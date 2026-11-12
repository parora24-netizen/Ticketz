import { redirect } from 'next/navigation'
import { ADMIN_TABS, Tabs } from '@/components/tabs'
import { Chip, PageHeader } from '@/components/ui'
import { getMe } from '@/lib/auth'
import { emailConfigured, emailSender } from '@/lib/email'
import { createClient } from '@/lib/supabase/server'
import { EmailControls, OversightPicker } from './email-controls'
import { oversightIds } from '@/lib/asks-server'

const KIND: Record<string, string> = { ask: 'Ask given', ask_answered: 'Ask answered', digest: 'Digest', test: 'Test' }

/** Admin > Email: whether email is set up and on, a test to yourself, and what has gone out. */
export default async function EmailAdminPage() {
  const me = await getMe()
  if (me.role !== 'lead') redirect('/')
  const supabase = await createClient()
  const [{ data: setting }, { data: log }, { data: people }] = await Promise.all([
    supabase.from('app_settings').select('value, updated_at').eq('key', 'email').maybeSingle(),
    supabase.from('email_log').select('kind, subject, status, error, at, people(name)').order('at', { ascending: false }).limit(30),
    supabase.from('people').select('id, name, email_notify, email_digest').eq('active', true).not('email', 'is', null).order('name'),
  ])
  const live = !!(setting?.value as { live?: boolean } | null)?.live
  const configured = emailConfigured()
  const cron = !!process.env.CRON_SECRET
  const optedOut = (people ?? []).filter((p) => !p.email_notify || !p.email_digest)
  const one = <T,>(v: unknown) => ((Array.isArray(v) ? v[0] : v) ?? null) as T | null

  return (
    <>
      <Tabs items={ADMIN_TABS} active="email" />
      <PageHeader sub="Emails from Launchpad: an ask given to you, an answer to an ask you raised, and a weekday 9:00 digest of what waits on you." />
      <section className="card mb-4">
        <dl className="divide-y divide-[var(--row)] text-[13px]">
          <div className="flex items-center justify-between gap-3 px-4 py-2.5"><dt>Microsoft 365 app (M365_TENANT_ID, M365_CLIENT_ID, M365_CLIENT_SECRET)</dt><dd><Chip tone={configured ? 'good' : 'crit'}>{configured ? 'Set' : 'Missing'}</Chip></dd></div>
          <div className="flex items-center justify-between gap-3 px-4 py-2.5"><dt>Morning digest schedule (CRON_SECRET)</dt><dd><Chip tone={cron ? 'good' : 'warn'}>{cron ? 'Set' : 'Missing: the digest will not run'}</Chip></dd></div>
          <div className="flex items-center justify-between gap-3 px-4 py-2.5"><dt>Sender</dt><dd className="mono text-[12.5px]">{emailSender()}</dd></div>
          <div className="flex items-center justify-between gap-3 px-4 py-2.5"><dt>For the team</dt><dd><Chip tone={live ? 'good' : 'muted'}>{live ? 'On' : 'Off: only tests to you go out'}</Chip></dd></div>
          <div className="flex items-center justify-between gap-3 px-4 py-2.5"><dt>Turned some off</dt><dd className="text-[12.5px]">{optedOut.length ? optedOut.map((p) => `${p.name} (${[!p.email_notify && 'asks', !p.email_digest && 'digest'].filter(Boolean).join(', ')})`).join(' · ') : 'No one'}</dd></div>
        </dl>
        <EmailControls live={live} configured={configured} people={(people ?? []).map((p) => ({ id: p.id as string, name: p.name as string }))} />
      </section>
      <section className="card mb-4">
        <h2 className="border-b border-[var(--line)] px-4 py-2 text-[14px] font-semibold text-[var(--navy-ink)]">Oversight <span className="font-normal text-[12px] text-[var(--muted)]">· who also gets what is overdue or unowned, pull requests nobody reviews, proposals to approve, retests nobody gets and runner alerts</span></h2>
        <OversightPicker people={(people ?? []).map((p) => ({ id: p.id as string, name: p.name as string }))} chosen={await oversightIds(supabase)} />
      </section>
      <section className="card">
        <h2 className="border-b border-[var(--line)] px-4 py-2 text-[14px] font-semibold text-[var(--navy-ink)]">Sent lately</h2>
        <table className="table w-full text-[12.5px]">
          <thead><tr><th>When</th><th>To</th><th>Kind</th><th>Subject</th><th>Status</th></tr></thead>
          <tbody>
            {(log ?? []).map((l, i) => (
              <tr key={i}>
                <td className="mono whitespace-nowrap">{new Date(l.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })}</td>
                <td>{one<{ name: string }>(l.people)?.name ?? ''}</td>
                <td>{KIND[l.kind] ?? l.kind}</td>
                <td>{l.subject}</td>
                <td>{l.status === 'sent' ? <Chip tone="good">Sent</Chip> : <span className="text-[var(--crit)]" title={l.error ?? ''}>Failed: {l.error}</span>}</td>
              </tr>
            ))}
            {!(log ?? []).length && <tr><td colSpan={5} className="text-[var(--muted)]">Nothing sent yet.</td></tr>}
          </tbody>
        </table>
      </section>
    </>
  )
}
