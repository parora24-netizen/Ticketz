'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getMe } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'

const Patch = z.object({
  owner_id: z.uuid().nullable().optional(),
  due_on: z.iso.date().nullable().optional(),
  automate_due_on: z.iso.date().nullable().optional(),
  /** true marks the pages' cases written today; false reopens them. */
  done: z.boolean().optional(),
})

/** Pages' writing: who writes them, when they are due, and whether they are finished. Lead, or the pages' writer for "done". */
export async function updatePages(ids: string[], patch: z.infer<typeof Patch>): Promise<{ error?: string }> {
  const me = await getMe()
  const v = Patch.safeParse(patch)
  const list = z.array(z.uuid()).min(1).max(200).safeParse(ids)
  if (!v.success || !list.success) return { error: 'That change was not understood' }
  const supabase = await createClient()
  const { data: areas } = await supabase.from('areas').select('owner_id').in('id', list.data)
  const onlyDone = v.data.owner_id === undefined && v.data.due_on === undefined && v.data.automate_due_on === undefined
  const mine = !!areas?.length && areas.every((a) => a.owner_id === me.id)
  if (me.role !== 'lead' && !(onlyDone && mine)) return { error: 'Only the lead can change this; writers can mark their own pages completed' }
  const { done, ...rest } = v.data
  if (Object.keys(rest).length) {
    const { error } = await supabase.from('areas').update(rest).in('id', list.data)
    if (error) return { error: error.message }
  }
  // Completing keeps the date a page was first completed; reopening clears it.
  if (done !== undefined) {
    const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10)
    const q = supabase.from('areas').update({ cases_done_on: done ? today : null }).in('id', list.data)
    const { error } = done ? await q.is('cases_done_on', null) : await q
    if (error) return { error: error.message }
  }
  revalidatePath('/cases/progress')
  return {}
}
