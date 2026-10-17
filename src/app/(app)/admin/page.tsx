import Link from 'next/link'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { Flash } from '@/components/flash'
import { TeamGrid } from '@/components/grid/list-grids'
import { SubmitButton } from '@/components/submit-button'
import { Tabs } from '@/components/tabs'
import { PageHeader } from '@/components/ui'
import { getMe } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { fmtDate, loadPeople } from '@/lib/data'
import { createCiToken, revokeCiToken, savePerson } from '../actions'

const TABS = [
  { key: 'team', href: '/admin', label: 'Team' },
  { key: 'ci', href: '/admin?tab=ci', label: 'CI tokens' },
]

export default async function AdminPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const me = await getMe()
  if (me.role !== 'lead') redirect('/')
  const sp = await searchParams
  const tab = sp.tab === 'ci' ? 'ci' : 'team'
  const supabase = await createClient()
  const [people, { data: tokens }] = await Promise.all([
    loadPeople(),
    supabase.from('ci_tokens').select('id, label, created_at, last_used_at, revoked_at').order('created_at', { ascending: false }),
  ])
  const newToken = (await cookies()).get('new_ci_token')?.value
  const noEmail = people.filter((p) => p.active && !p.email).length

  return (
    <>
      <Tabs items={TABS} active={tab} />
      <Flash error={sp.error} ok={sp.ok} />
      {tab === 'team' ? (
        <>
          <PageHeader sub={`Only people listed here can sign in, with the email shown.${noEmail ? ` ${noEmail} still need an email.` : ''} Double-click a cell to edit.`}>
            <Link href={sp.add ? '/admin' : '/admin?add=1'} {...(sp.add ? {} : { 'data-create': '' })} className={`btn ${sp.add ? '' : 'btn-primary'}`}>{sp.add ? 'Cancel' : '+ Add person'}</Link>
          </PageHeader>
          {sp.add && (
            <form action={savePerson} className="card mb-4 flex flex-wrap items-end gap-3 p-4">
              <label><span className="label">Name</span><input name="name" required autoFocus className="input mt-1 block w-56" /></label>
              <label><span className="label">Work email</span><input name="email" type="email" placeholder="name@vulqan.ai" className="input mono mt-1 block w-72" /></label>
              <label><span className="label">Role</span>
                <select name="role" defaultValue="dev" className="select mt-1 block w-40"><option value="lead">Lead</option><option value="dev">Developer</option><option value="qa">QA</option></select>
              </label>
              <SubmitButton primary pendingText="Adding…">Add person</SubmitButton>
            </form>
          )}
          <TeamGrid rows={people.map((p) => ({ id: p.id, name: p.name, email: p.email, role: p.role, active: p.active }))} />
        </>
      ) : (
        <>
          <PageHeader sub={<>The automated suite posts results to <code className="mono">/api/results</code> with one of these tokens. The README has the payload.</>} />
          {newToken && (
            <div className="mb-4 border border-[var(--warn-line)] bg-[var(--warn-soft)] p-3 text-[13px]">
              Copy this token now; it is not shown again:
              <code className="mono mt-1 block break-all">{newToken}</code>
            </div>
          )}
          <form action={createCiToken} className="mb-4 flex flex-wrap items-end gap-3">
            <label><span className="label">Label</span><input name="label" placeholder="e.g. CodeBuild e2e" className="input mt-1 block w-72" /></label>
            <SubmitButton primary pendingText="Creating…">Create token</SubmitButton>
          </form>
          <div className="border border-[var(--line)] bg-white">
            <table className="table grid-table">
              <thead><tr><th>Label</th><th>Created</th><th>Last used</th><th>Status</th></tr></thead>
              <tbody>
                {(tokens ?? []).map((t) => (
                  <tr key={t.id}>
                    <td>{t.label}</td>
                    <td className="mono text-[12px]">{fmtDate(t.created_at)}</td>
                    <td className="mono text-[12px]">{t.last_used_at ? fmtDate(t.last_used_at) : 'Never'}</td>
                    <td>{t.revoked_at ? <span className="text-[var(--muted)]">Revoked</span> : (
                      <form action={revokeCiToken}><input type="hidden" name="token_id" value={t.id} /><SubmitButton small pendingText="Revoking…">Revoke</SubmitButton></form>
                    )}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!tokens?.length && <p className="p-6 text-center text-[13px] text-[var(--muted)]">No tokens yet.</p>}
          </div>
        </>
      )}
    </>
  )
}
