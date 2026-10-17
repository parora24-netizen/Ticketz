import Link from 'next/link'
import { Flash } from '@/components/flash'
import { SubmitButton } from '@/components/submit-button'
import { PageHeader } from '@/components/ui'
import { raiseTicket } from '../../actions'

export default async function NewTicketPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams
  return (
    <>
      <PageHeader sub="For a failure found on a test case, raise it from that case so the two stay linked." />
      <Flash error={sp.error} ok={sp.ok} />
      <form action={raiseTicket} className="card grid max-w-3xl gap-4 p-5 sm:grid-cols-4">
        <input type="hidden" name="back" value="/tickets/new" />
        <label className="sm:col-span-4">
          <span className="label">Title</span>
          <input name="title" required minLength={3} placeholder="What is wrong" className="input mt-1 w-full" />
        </label>
        <label className="sm:col-span-2">
          <span className="label">Severity</span>
          <select name="severity" defaultValue="High" className="select mt-1 w-full">
            {['Critical', 'High', 'Medium', 'Low'].map((p) => <option key={p}>{p}</option>)}
          </select>
        </label>
        <label className="sm:col-span-2">
          <span className="label">Kind</span>
          <select name="kind" defaultValue="defect" className="select mt-1 w-full">
            <option value="defect">Product defect</option>
            <option value="test_mismatch">Test is wrong</option>
          </select>
        </label>
        <label className="sm:col-span-4">
          <span className="label">Description</span>
          <textarea name="description" rows={6} placeholder={'Where it happens, which build, steps to reproduce, what you expected'} className="input mt-1 w-full" />
        </label>
        <div className="flex gap-2 sm:col-span-4">
          <SubmitButton primary pendingText="Raising…">Raise ticket</SubmitButton>
          <Link href="/tickets" className="btn">Cancel</Link>
        </div>
      </form>
    </>
  )
}
