'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getMe } from '@/lib/auth'
import { isTicketFilePath, withAttachments } from '@/lib/ticket-files'
import { createClient } from '@/lib/supabase/server'

/** Adds screenshots the ticket page has just uploaded for this ticket. Anyone on the team. */
export async function addTicketAttachments(ticketId: string, paths: string[]): Promise<{ error?: string }> {
  await getMe()
  const v = z.object({ id: z.uuid(), paths: z.array(z.string().max(300)).min(1).max(10) }).safeParse({ id: ticketId, paths })
  if (!v.success) return { error: 'Those files could not be added' }
  if (v.data.paths.some((p) => !isTicketFilePath(p, v.data.id))) return { error: 'Those files belong to another ticket' }
  const supabase = await createClient()
  const { data: t, error: readError } = await supabase.from('tickets').select('key, attachments').eq('id', v.data.id).maybeSingle()
  if (readError || !t) return { error: readError?.message ?? 'No such ticket' }
  const next = withAttachments((t.attachments as string[] | null) ?? [], v.data.paths)
  if (next.error) return { error: next.error }
  const { error } = await supabase.from('tickets').update({ attachments: next.paths }).eq('id', v.data.id)
  if (error) return { error: error.message }
  revalidatePath(`/tickets/${encodeURIComponent(t.key as string)}`)
  return {}
}
