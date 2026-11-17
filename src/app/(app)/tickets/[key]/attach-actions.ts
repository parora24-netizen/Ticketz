'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getMe } from '@/lib/auth'
import { attachmentAddedBy, isTicketFilePath, withAttachments } from '@/lib/ticket-files'
import { createClient, createServiceClient } from '@/lib/supabase/server'

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

/** Takes a screenshot off a ticket and deletes the file. Whoever added it, or a lead. */
export async function removeTicketAttachment(ticketId: string, path: string): Promise<{ error?: string }> {
  const me = await getMe()
  const v = z.object({ id: z.uuid(), path: z.string().min(1).max(300) }).safeParse({ id: ticketId, path })
  if (!v.success) return { error: 'No such file' }
  const supabase = await createClient()
  const { data: t, error: readError } = await supabase.from('tickets').select('key, attachments, created_by').eq('id', v.data.id).maybeSingle()
  if (readError || !t) return { error: readError?.message ?? 'No such ticket' }
  const current = (t.attachments as string[] | null) ?? []
  if (!current.includes(v.data.path)) return { error: 'That file is no longer on this ticket' }
  if (me.role !== 'lead') {
    const service = createServiceClient()
    const { data: log } = await service.from('change_log').select('action, changes, actor_id')
      .eq('table_name', 'tickets').eq('row_id', v.data.id).in('action', ['insert', 'update']).order('at', { ascending: true }).order('id', { ascending: true })
    if (attachmentAddedBy(v.data.path, log ?? [], (t.created_by as string | null) ?? null) !== me.id) return { error: 'Only the person who added a file, or a lead, can remove it' }
  }
  const { error } = await supabase.from('tickets').update({ attachments: current.filter((p) => p !== v.data.path) }).eq('id', v.data.id)
  if (error) return { error: error.message }
  await createServiceClient().storage.from('evidence').remove([v.data.path])
  revalidatePath(`/tickets/${encodeURIComponent(t.key as string)}`)
  return {}
}
