import { Flash } from '@/components/flash'
import { SubmitButton } from '@/components/submit-button'
import { PageHeader } from '@/components/ui'
import { loadPeople } from '@/lib/data'
import { newAsk } from '../actions'

/** Ask someone for something: a need, a question or a decision, with the cases waiting on it. */
export default async function NewAskPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams
  const people = (await loadPeople()).filter((p) => p.active)
  return (
    <>
      <PageHeader title="New ask" sub="Something a person has to do or decide before testing or automation can go on. Its owner is notified." />
      <Flash error={sp.error} />
      <form action={newAsk} className="card max-w-3xl space-y-3 p-5 text-[13px]">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block"><span className="label">Kind</span>
            <select name="kind" defaultValue="question" className="select mt-1 w-full">
              <option value="question">Question</option><option value="need">Need (a server, account, mailbox…)</option><option value="decision">Decision</option>
            </select>
          </label>
          <label className="block"><span className="label">Owner</span>
            <select name="owner" defaultValue="" className="select mt-1 w-full">
              <option value="">No one yet</option>
              {people.map((p) => <option key={p.id} value={p.name}>{p.name}</option>)}
            </select>
          </label>
          <label className="block"><span className="label">Due</span><input type="date" name="due_on" className="input mt-1 w-full" /></label>
        </div>
        <label className="block"><span className="label">Title</span><input name="title" required minLength={3} maxLength={300} className="input mt-1 w-full" placeholder="e.g. Which approver should the Approvals cases log in as?" /></label>
        <label className="block"><span className="label">Detail</span><textarea name="detail" rows={4} maxLength={5000} className="input mt-1 w-full" /></label>
        <label className="block"><span className="label">Cases waiting on it</span><input name="cases" className="input mt-1 w-full mono" placeholder="TC_12, TC_13" /></label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block"><span className="label">Need key (needs)</span><input name="need_key" className="input mt-1 w-full mono" placeholder="server.mssql" /></label>
          <label className="block"><span className="label">Defect to restore (decisions)</span><input name="ticket" className="input mt-1 w-full mono" placeholder="DEV-12" /></label>
        </div>
        <label className="block"><span className="label">Options (decisions, one per line)</span><textarea name="options" rows={3} className="input mt-1 w-full" placeholder={'Restore the control\nRewrite the case\nRetire the case'} /></label>
        <SubmitButton primary pendingText="Asking…">Ask</SubmitButton>
      </form>
    </>
  )
}
