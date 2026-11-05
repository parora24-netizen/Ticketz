import { redirect } from 'next/navigation'
import { Flash } from '@/components/flash'
import { PageHeader } from '@/components/ui'
import { getMe } from '@/lib/auth'
import { loadAreas } from '@/lib/data'
import { SprintForm } from '../sprint-form'

export default async function NewSprintPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const me = await getMe()
  if (me.role !== 'lead') redirect('/sprints')
  const sp = await searchParams
  return (
    <>
      <PageHeader sub="Dates and goal, and the pages it covers. You can change all of these on Release › Plan." />
      <Flash error={sp.error} ok={sp.ok} />
      <div className="card max-w-5xl p-5"><SprintForm areas={await loadAreas()} /></div>
    </>
  )
}
