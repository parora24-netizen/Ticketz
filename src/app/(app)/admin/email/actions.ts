'use server'

import { revalidatePath } from 'next/cache'
import { getMe } from '@/lib/auth'
import { sendDigestPreview, sendDigests, sendTestEmail } from '@/lib/email'
import { createClient, createServiceClient } from '@/lib/supabase/server'

/** Lead only: turn email on or off for the whole team. */
export async function setEmailLive(live: boolean): Promise<{ error?: string }> {
  const me = await getMe()
  if (me.role !== 'lead') return { error: 'Only the lead turns email on' }
  const supabase = await createClient()
  const { error } = await supabase.from('app_settings').upsert({ key: 'email', value: { live }, updated_by: me.id, updated_at: new Date().toISOString() })
  if (error) return { error: error.message }
  revalidatePath('/admin/email')
  return {}
}

/** Lead only: a test email, or today's digest, to the lead alone, whether or not email is on. */
export async function sendToMe(what: 'test' | 'digest'): Promise<{ error?: string; note?: string }> {
  const me = await getMe()
  if (me.role !== 'lead') return { error: 'Only the lead sends test emails' }
  const res = what === 'test' ? await sendTestEmail(me.id) : await sendDigests({ onlyPersonId: me.id, force: true })
  revalidatePath('/admin/email')
  if ('error' in res && res.error) return { error: res.error }
  if ('sent' in res) return res.failed.length ? { error: res.failed.join('; ') } : { note: res.sent ? 'Digest sent to you' : 'Nothing waits on you, so there is no digest to send' }
  return { note: `Test email sent to ${me.email}` }
}

/** Anyone: which emails they get. Only their own row. */
export async function setMyEmailPrefs(prefs: { email_notify?: boolean; email_digest?: boolean }): Promise<{ error?: string }> {
  const me = await getMe()
  const patch = Object.fromEntries(Object.entries(prefs).filter(([k, v]) => ['email_notify', 'email_digest'].includes(k) && typeof v === 'boolean'))
  if (!Object.keys(patch).length) return { error: 'Nothing to change' }
  const { error } = await createServiceClient().from('people').update(patch).eq('id', me.id)
  return error ? { error: error.message } : {}
}

/** Lead only: someone's digest, sent to the lead to look at. */
export async function previewDigest(personId: string): Promise<{ error?: string; note?: string }> {
  const me = await getMe()
  if (me.role !== 'lead') return { error: 'Only the lead previews digests' }
  return sendDigestPreview(personId, me.id)
}
