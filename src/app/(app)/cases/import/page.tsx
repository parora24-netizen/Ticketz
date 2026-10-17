import { redirect } from 'next/navigation'
import { PageHeader } from '@/components/ui'
import { getMe } from '@/lib/auth'
import { ImportForm } from './import-form'

export default async function ImportPage() {
  const me = await getMe()
  if (me.role === 'dev') redirect('/cases')
  return (
    <>
      <PageHeader title="Import test cases" sub="Add new cases or update existing ones by Test Case ID. Nothing is saved until you confirm the preview." />
      <ImportForm />
    </>
  )
}
