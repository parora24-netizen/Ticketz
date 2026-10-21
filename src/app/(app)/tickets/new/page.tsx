import { Flash } from '@/components/flash'
import { PageHeader } from '@/components/ui'
import { loadAreas } from '@/lib/data'
import { NewTicketForm } from './ticket-form'

export default async function NewTicketPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams
  const areas = await loadAreas()
  return (
    <>
      <PageHeader sub="For a failure found on a test case, raise it from that case so the two stay linked." />
      <Flash error={sp.error} ok={sp.ok} />
      <NewTicketForm areas={areas.map((a) => ({ id: a.id, zone: a.zone, page: a.page }))} />
    </>
  )
}
