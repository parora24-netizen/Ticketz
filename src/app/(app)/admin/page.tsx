import { SubmitButton } from '@/components/submit-button'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/ui'
import { Flash } from '@/components/flash'
import { getMe } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { fmtDate, loadPeople } from '@/lib/data'
import { createCiToken, revokeCiToken, savePerson } from '../actions'

export default async function AdminPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const me = await getMe()
  if (me.role !== 'lead') redirect('/')
  const sp = await searchParams
  const supabase = await createClient()
  const [people, { data: tokens }] = await Promise.all([
    loadPeople(),
    supabase.from('ci_tokens').select('id, label, created_at, last_used_at, revoked_at').order('created_at', { ascending: false }),
  ])
  const newToken = (await cookies()).get('new_ci_token')?.value

  return (
    <>
      <PageHeader title="Admin" sub="Who can sign in, their role, and tokens for the CI pipeline." />
      <Flash error={sp.error} ok={sp.ok} />

      <section className="card overflow-x-auto">
        <h2 className="px-4 pt-4 font-semibold">Team</h2>
        <p className="px-4 text-sm text-[var(--muted)]">Only people listed here, signing in with this email, can use the tracker.</p>
        <table className="table mt-2">
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Active</th><th></th></tr></thead>
          <tbody>
            {people.map((p) => (
              <tr key={p.id}>
                <td colSpan={5} className="p-0">
                  <form action={savePerson} className="grid grid-cols-[1fr_1.4fr_auto_auto_auto] items-center gap-2 px-3 py-2">
                    <input type="hidden" name="id" value={p.id} />
                    <input name="name" defaultValue={p.name} required className="input" />
                    <input name="email" type="email" defaultValue={p.email ?? ''} placeholder="Add an email to let them sign in" className="input" />
                    <select name="role" defaultValue={p.role} className="select"><option value="lead">Lead</option><option value="dev">Dev</option><option value="qa">QA</option></select>
                    <label className="flex items-center gap-1 text-sm"><input type="checkbox" name="active" value="1" defaultChecked={p.active} />Active</label>
                    <SubmitButton primary>Save</SubmitButton>
                  </form>
                </td>
              </tr>
            ))}
            <tr>
              <td colSpan={5} className="p-0">
                <form action={savePerson} className="grid grid-cols-[1fr_1.4fr_auto_auto] items-center gap-2 px-3 py-2">
                  <input name="name" required placeholder="New person" className="input" />
                  <input name="email" type="email" placeholder="name@vulqan.ai" className="input" />
                  <select name="role" defaultValue="dev" className="select"><option value="lead">Lead</option><option value="dev">Dev</option><option value="qa">QA</option></select>
                  <SubmitButton primary pendingText="Adding…">Add</SubmitButton>
                </form>
              </td>
            </tr>
          </tbody>
        </table>
      </section>

      <section className="card mt-6 p-4">
        <h2 className="font-semibold">CI tokens</h2>
        <p className="text-sm text-[var(--muted)]">The automated suite posts results to <code className="font-mono">/api/results</code> with one of these. See the README for the payload.</p>
        {newToken && (
          <div className="mt-3 rounded-[2px] bg-[var(--warn-soft)] p-3 text-sm">
            Copy this token now; it is not shown again:
            <code className="mt-1 block break-all font-mono">{newToken}</code>
          </div>
        )}
        <form action={createCiToken} className="mt-3 flex gap-2">
          <input name="label" placeholder="Label, e.g. CodeBuild e2e" className="input flex-1" />
          <SubmitButton primary pendingText="Creating…">Create token</SubmitButton>
        </form>
        <table className="table mt-3">
          <thead><tr><th>Label</th><th>Created</th><th>Last used</th><th></th></tr></thead>
          <tbody>
            {(tokens ?? []).map((t) => (
              <tr key={t.id}>
                <td>{t.label}</td><td>{fmtDate(t.created_at)}</td><td>{t.last_used_at ? fmtDate(t.last_used_at) : 'Never'}</td>
                <td>{t.revoked_at ? <span className="text-[var(--muted)]">Revoked</span> : (
                  <form action={revokeCiToken}><input type="hidden" name="token_id" value={t.id} /><SubmitButton pendingText="Revoking…">Revoke</SubmitButton></form>
                )}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </>
  )
}
