'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { getMe } from '@/lib/auth'
import { CASE_FILES_BUCKET, MAX_CASE_FILE_BYTES, MAX_CASE_FILES_AT_ONCE, isCaseFilePath } from '@/lib/case-files'
import { createClient, createServiceClient } from '@/lib/supabase/server'

const Added = z.object({
  case_id: z.uuid(),
  files: z.array(z.object({
    path: z.string().max(300),
    name: z.string().trim().min(1).max(200),
    size: z.number().int().min(0).max(MAX_CASE_FILE_BYTES),
    type: z.string().max(200).nullable(),
  })).min(1).max(MAX_CASE_FILES_AT_ONCE),
})

/** Records files the case page has just uploaded to the case-files bucket under this case. */
export async function addCaseFiles(input: z.infer<typeof Added>): Promise<{ error?: string; added?: number }> {
  const me = await getMe()
  const v = Added.safeParse(input)
  if (!v.success) return { error: 'Those files could not be added' }
  if (v.data.files.some((f) => !isCaseFilePath(f.path, v.data.case_id))) return { error: 'Those files belong to another case' }
  const supabase = await createClient()
  const { error } = await supabase.from('case_files').insert(v.data.files.map((f) => ({
    case_id: v.data.case_id, path: f.path, name: f.name, size_bytes: f.size, content_type: f.type || null, uploaded_by: me.id,
  })))
  if (error) return { error: error.message }
  revalidatePath('/cases', 'layout')
  return { added: v.data.files.length }
}

/** Removes a file: the person who added it, or a lead. The row's rules decide; the file goes with it. */
export async function removeCaseFile(id: string): Promise<{ error?: string }> {
  await getMe()
  if (!z.uuid().safeParse(id).success) return { error: 'No such file' }
  const supabase = await createClient()
  const { data, error } = await supabase.from('case_files').delete().eq('id', id).select('path')
  if (error) return { error: error.message }
  if (!data?.length) return { error: 'Only the person who added a file, or a lead, can remove it' }
  await createServiceClient().storage.from(CASE_FILES_BUCKET).remove(data.map((r) => r.path as string))
  revalidatePath('/cases', 'layout')
  return {}
}
