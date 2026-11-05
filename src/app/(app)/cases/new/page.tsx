import Link from 'next/link'
import { redirect } from 'next/navigation'
import { Flash } from '@/components/flash'
import { SubmitButton } from '@/components/submit-button'
import { PageHeader } from '@/components/ui'
import { getMe } from '@/lib/auth'
import { loadAreas } from '@/lib/data'
import { createTestCase } from '../../actions'

export default async function NewCasePage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const me = await getMe()
  if (me.role === 'dev') redirect('/cases')
  const sp = await searchParams
  const areas = await loadAreas()
  const zones = [...new Set(areas.map((a) => a.zone))]
  return (
    <>
      <PageHeader sub="It joins its area's sprint straight away.">
        <Link href="/cases/import" className="btn">Import many instead</Link>
      </PageHeader>
      <Flash error={sp.error} ok={sp.ok} />
      <form action={createTestCase} className="card grid max-w-4xl gap-4 p-5 md:grid-cols-6">
        <div className="md:col-span-2">
          <span className="label">Test case ID</span>
          <p className="mt-2 text-[12.5px] text-[var(--muted)]">Launchpad assigns it when you save</p>
        </div>
        <label className="md:col-span-2">
          <span className="label">Area</span>
          <select name="area_id" required defaultValue={sp.area ?? ''} className="select mt-1 w-full">
            <option value="" disabled>Choose an area</option>
            {zones.map((z) => (
              <optgroup key={z} label={z}>
                {areas.filter((a) => a.zone === z).map((a) => <option key={a.id} value={a.id}>{a.page}</option>)}
              </optgroup>
            ))}
          </select>
        </label>
        <label>
          <span className="label">Priority</span>
          <select name="priority" defaultValue="High" className="select mt-1 w-full">
            {['Critical', 'High', 'Medium', 'Low'].map((p) => <option key={p}>{p}</option>)}
          </select>
        </label>
        <label>
          <span className="label">Type</span>
          <select name="test_type" defaultValue="Positive" className="select mt-1 w-full">
            {['Positive', 'Negative', 'Functional', 'UI'].map((p) => <option key={p}>{p}</option>)}
          </select>
        </label>
        <label className="md:col-span-6">
          <span className="label">Title</span>
          <input name="title" required minLength={3} placeholder="Verify …" className="input mt-1 w-full" />
        </label>
        <label className="md:col-span-3">
          <span className="label">Pre-conditions</span>
          <textarea name="preconditions" rows={3} className="input mt-1 w-full" />
        </label>
        <label className="md:col-span-3">
          <span className="label">Test data</span>
          <textarea name="test_data" rows={3} className="input mt-1 w-full" />
        </label>
        <label className="md:col-span-3">
          <span className="label">Steps</span>
          <textarea name="steps" rows={6} placeholder={'1. Open …\n2. Click …'} className="input mt-1 w-full" />
        </label>
        <label className="md:col-span-3">
          <span className="label">Expected result</span>
          <textarea name="expected" rows={6} className="input mt-1 w-full" />
        </label>
        <div className="flex flex-wrap items-center gap-2 md:col-span-6">
          <SubmitButton primary>Add test case</SubmitButton>
          <SubmitButton name="another" value="1">Add and start another</SubmitButton>
          <Link href="/cases" className="btn">Cancel</Link>
        </div>
      </form>
    </>
  )
}
