'use server'

import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { getMe } from '@/lib/auth'
import { AskCreate, AskPatch } from '@/lib/automation-loop'
import { createAsk, patchAsk, ticketId } from '@/lib/asks-server'
import { createClient } from '@/lib/supabase/server'

const list = (v: FormDataEntryValue | null) => String(v ?? '').split(/[\s,]+/).map((x) => x.trim()).filter(Boolean)
const text = (v: FormDataEntryValue | null) => String(v ?? '').trim() || undefined
const lines = (v: FormDataEntryValue | null) => { const l = String(v ?? '').split('\n').map((x) => x.trim()).filter(Boolean); return l.length ? l : undefined }

/** New ask from the form: anyone on the team can ask for something. */
export async function newAsk(formData: FormData) {
  const me = await getMe()
  const v = AskCreate.safeParse({
    kind: formData.get('kind'), title: text(formData.get('title')), detail: text(formData.get('detail')),
    need_key: text(formData.get('need_key')), owner: text(formData.get('owner')), due_on: text(formData.get('due_on')),
    options: formData.get('kind') === 'decision' ? lines(formData.get('options')) : undefined,
    cases: list(formData.get('cases')), ticket: text(formData.get('ticket')),
  })
  if (!v.success) redirect(`/asks/new?error=${encodeURIComponent(v.error.issues[0]?.message ?? 'Check the form')}`)
  const res = await createAsk(await createClient(), v.data, { personId: me.id })
  if ('error' in res) redirect(`/asks/new?error=${encodeURIComponent(res.error ?? 'Could not save')}`)
  revalidatePath('/', 'layout')
  redirect(`/asks/${res.key}?ok=${encodeURIComponent(res.created ? 'Asked' : `Added to ${res.key}, which already asks for this`)}`)
}

/** Answer, provide, decide or decline an ask, or change its owner, due date or cases. */
export async function changeAsk(key: string, patch: z.input<typeof AskPatch>): Promise<{ error?: string; effect?: string }> {
  const me = await getMe()
  const v = AskPatch.safeParse(patch)
  if (!v.success) return { error: v.error.issues[0]?.message ?? 'That change was not understood' }
  const res = await patchAsk(await createClient(), key, v.data, { personId: me.id })
  if ('error' in res) return { error: res.error }
  revalidatePath('/', 'layout')
  return { effect: res.effect }
}

/** The lead approves or turns down the runner's "not automatable" proposals. */
export async function decideProposals(caseIds: string[], approve: boolean): Promise<{ error?: string }> {
  const me = await getMe()
  if (me.role !== 'lead') return { error: 'Only the lead decides what is not automatable' }
  const ids = z.array(z.uuid()).min(1).max(500).safeParse(caseIds)
  if (!ids.success) return { error: 'Nothing to decide' }
  const supabase = await createClient()
  const { error } = await supabase.from('test_cases').update({
    ...(approve ? { automation: 'manual_only' } : {}),
    automation_proposed: null, automation_decided_by: me.id, automation_decided_at: new Date().toISOString(),
  }).in('id', ids.data).not('automation_proposed', 'is', null)
  if (error) return { error: error.message }
  revalidatePath('/', 'layout')
  return {}
}

/** The lead holds a screen for automation (until a defect closes, or a date), or lifts the hold. */
export async function setHold(areaId: string, hold: { defect?: string; reason?: string; until?: string } | null): Promise<{ error?: string }> {
  const me = await getMe()
  if (me.role !== 'lead') return { error: 'Only the lead holds screens' }
  if (!z.uuid().safeParse(areaId).success) return { error: 'Unknown page' }
  const supabase = await createClient()
  const ticket = hold?.defect ? await ticketId(supabase, hold.defect) : null
  if (hold?.defect && !ticket) return { error: `No ticket ${hold.defect}` }
  if (hold && !ticket && !hold.until) return { error: 'Hold it until a defect closes or until a date' }
  const { error } = await supabase.from('areas').update({
    automation_hold_ticket_id: ticket, automation_hold_reason: hold?.reason?.trim() || null, automation_hold_until: hold?.until || null,
  }).eq('id', areaId)
  if (error) return { error: error.message }
  revalidatePath('/cases/automation')
  return {}
}
