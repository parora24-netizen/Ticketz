import 'server-only'
import { serverEnv } from '@/lib/env'
import { loadInbox, type InboxItem } from '@/lib/asks-server'
import { createServiceClient } from '@/lib/supabase/server'
import { askEmail, digestEmail, type Mail } from '@/lib/email-templates'

/**
 * Email through Microsoft 365: Launchpad's app in Vulqan's tenant sends from one mailbox with Graph
 * (application permission Mail.Send). Nothing reaches the team until the lead turns email on (Admin >
 * Email), and each person can turn off either kind for themselves. Without the app's settings nothing
 * is sent. A failure is logged and never stops the change that caused it.
 */
const m365 = () => ({
  tenant: process.env.M365_TENANT_ID, client: process.env.M365_CLIENT_ID, secret: process.env.M365_CLIENT_SECRET,
  sender: process.env.M365_SENDER ?? 'notifications@vulqan.ai',
})
export const emailSender = () => m365().sender
const appUrl = () => serverEnv().appUrl || 'https://vulqan-launchpad.vercel.app'
const db = () => createServiceClient()

export const emailConfigured = () => { const c = m365(); return !!(c.tenant && c.client && c.secret) }

// The app's Graph token, kept until shortly before it expires.
let token: { value: string; until: number } | null = null
async function graphToken(): Promise<string> {
  if (token && token.until > Date.now() + 60_000) return token.value
  const c = m365()
  const res = await fetch(`https://login.microsoftonline.com/${c.tenant}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: c.client!, client_secret: c.secret!, scope: 'https://graph.microsoft.com/.default', grant_type: 'client_credentials' }),
  })
  const body = await res.json().catch(() => ({})) as { access_token?: string; expires_in?: number; error_description?: string }
  if (!res.ok || !body.access_token) throw new Error(`Microsoft sign-in failed: ${body.error_description?.split('\r')[0] ?? res.status}`)
  token = { value: body.access_token, until: Date.now() + (body.expires_in ?? 3600) * 1000 }
  return token.value
}

export async function emailLive(): Promise<boolean> {
  const { data } = await db().from('app_settings').select('value').eq('key', 'email').maybeSingle()
  return !!(data?.value as { live?: boolean } | null)?.live
}

type Person = { id: string; name: string; email: string | null; active: boolean; role: string; email_notify: boolean; email_digest: boolean }
async function person(id: string): Promise<Person | null> {
  const { data } = await db().from('people').select('id, name, email, active, role, email_notify, email_digest').eq('id', id).maybeSingle()
  return data as Person | null
}

/** Sends one email and records it. */
async function send(to: Person, kind: 'ask' | 'ask_answered' | 'digest' | 'test', ref: string | null, mail: Mail): Promise<{ error?: string }> {
  if (!emailConfigured()) return { error: 'The Microsoft 365 app is not set up (M365_TENANT_ID, M365_CLIENT_ID, M365_CLIENT_SECRET)' }
  if (!to.email) return { error: `${to.name} has no email address` }
  let providerId: string | null = null
  let error: string | null = null
  try {
    const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(m365().sender)}/sendMail`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${await graphToken()}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: { subject: mail.subject, body: { contentType: 'HTML', content: mail.html }, toRecipients: [{ emailAddress: { address: to.email, name: to.name } }] },
        saveToSentItems: false,
      }),
    })
    // Graph answers 202 with no body; it gives a request id to trace a message by.
    if (res.ok) providerId = res.headers.get('request-id')
    else {
      const body = await res.json().catch(() => ({})) as { error?: { code?: string; message?: string } }
      error = body.error ? `${body.error.code}: ${body.error.message}` : `Microsoft answered ${res.status}`
    }
  } catch (e) {
    error = (e as Error).message
  }
  await db().from('email_log').insert({ person_id: to.id, kind, ref, subject: mail.subject, status: error ? 'failed' : 'sent', error, provider_id: providerId })
  return error ? { error } : {}
}

/**
 * The email that goes with an ask's notification: to its new owner when it is given to them, or to
 * whoever raised it when it is answered. Only while email is on, and never to the person who acted.
 */
export async function emailAboutAsk(askKey: string, event: 'assigned' | 'answered', actorId: string | null): Promise<void> {
  try {
    if (!emailConfigured() || !(await emailLive())) return
    const { data: a } = await db().from('asks').select('key, kind, title, detail, owner_id, created_by, due_on, state, answer, outcome, store, ask_cases(test_cases(tc_id))').eq('key', askKey).maybeSingle()
    if (!a) return
    const toId = event === 'assigned' ? a.owner_id : a.created_by
    if (!toId || toId === actorId) return
    const to = await person(toId)
    if (!to?.active || !to.email_notify) return
    const actor = actorId ? (await person(actorId))?.name ?? null : null
    const cases = ((a.ask_cases ?? []) as unknown as { test_cases: { tc_id: string } | { tc_id: string }[] | null }[])
      .map((l) => (Array.isArray(l.test_cases) ? l.test_cases[0] : l.test_cases)?.tc_id).filter((x): x is string => !!x)
    await send(to, event === 'assigned' ? 'ask' : 'ask_answered', a.key, askEmail({ ...a, cases, kind: a.kind }, event, actor, to.name, appUrl()))
  } catch {
    // An email that cannot go out must not undo the change that caused it.
  }
}

/** Each active person's digest of what waits on them, once a weekday; nothing to someone with nothing waiting. */
export async function sendDigests(opts: { onlyPersonId?: string; force?: boolean } = {}): Promise<{ sent: number; skipped: number; failed: string[] }> {
  const live = await emailLive()
  if (!opts.force && !live) return { sent: 0, skipped: 0, failed: ['Email is off for the team'] }
  const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10)
  let q = db().from('people').select('id, name, email, active, role, email_notify, email_digest').eq('active', true).not('email', 'is', null)
  if (opts.onlyPersonId) q = q.eq('id', opts.onlyPersonId)
  const { data: people } = await q
  const { data: done } = await db().from('email_log').select('person_id').eq('kind', 'digest').eq('ref', today).eq('status', 'sent')
  const already = new Set((done ?? []).map((d) => d.person_id))
  let sent = 0, skipped = 0
  const failed: string[] = []
  for (const p of (people ?? []) as Person[]) {
    if (!opts.force && (!p.email_digest || already.has(p.id))) { skipped++; continue }
    const items: InboxItem[] = await loadInbox(db(), p)
    if (!items.length) { skipped++; continue }
    const res = await send(p, 'digest', opts.force ? null : today, digestEmail(p.name, items, appUrl()))
    if (res.error) failed.push(`${p.name}: ${res.error}`)
    else sent++
  }
  return { sent, skipped, failed }
}

/** A test email to one person, whether or not email is on for the team. */
export async function sendTestEmail(personId: string): Promise<{ error?: string }> {
  const to = await person(personId)
  if (!to) return { error: 'Unknown person' }
  return send(to, 'test', null, {
    subject: 'Launchpad email works',
    text: `Hi ${to.name},\n\nThis is a test from Launchpad. If you can read this, email is set up.\n\n${appUrl()}`,
    html: `<p>Hi ${to.name},</p><p>This is a test from Launchpad. If you can read this, email is set up.</p><p><a href="${appUrl()}">Open Launchpad</a></p>`,
  })
}
