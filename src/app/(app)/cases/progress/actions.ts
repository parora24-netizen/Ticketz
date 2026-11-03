'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getMe } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

const Patch = z.object({
  owner_id: z.uuid().nullable().optional(),
  due_on: z.iso.date().nullable().optional(),
  /** true marks the page's cases written today; false reopens it. */
  done: z.boolean().optional(),
})

/** A page's writing: who writes it, when it is due, and whether it is finished. Lead, or the page's owner for "done". */
export async function updatePageWriting(areaId: string, patch: z.infer<typeof Patch>): Promise<{ error?: string }> {
  const me = await getMe()
  const v = Patch.safeParse(patch)
  if (!v.success || !z.uuid().safeParse(areaId).success) return { error: 'That change was not understood' }
  const supabase = await createClient()
  const { data: area } = await supabase.from('areas').select('owner_id').eq('id', areaId).single()
  const onlyDone = v.data.owner_id === undefined && v.data.due_on === undefined
  if (me.role !== 'lead' && !(onlyDone && area?.owner_id === me.id)) return { error: 'Only the lead or the page\'s writer can change this' }
  const { done, ...rest } = v.data
  const row = { ...rest, ...(done === undefined ? {} : { cases_done_on: done ? new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10) : null }) }
  const { error } = await supabase.from('areas').update(row).eq('id', areaId)
  if (error) return { error: error.message }
  revalidatePath('/cases/progress')
  return {}
}
