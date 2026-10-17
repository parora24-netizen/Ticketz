import { redirect } from 'next/navigation'

export default async function AreaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  redirect(`/cases?area=${id}`)
}
