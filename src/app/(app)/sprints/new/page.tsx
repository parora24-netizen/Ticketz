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
      <PageHeader sub="Pick 2 to 4 working days and the Framework areas to test in them." />
      <Flash error={sp.error} ok={sp.ok} />
      <div className="card max-w-5xl p-5"><SprintForm areas={await loadAreas()} /></div>
    </>
  )
}
