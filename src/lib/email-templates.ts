import { DONE_WORD, KIND_LABEL, type AskKind } from '@/lib/automation-loop'

/** The emails' words and markup, kept pure so they can be tested and previewed. */
export type Mail = { subject: string; html: string; text: string }
type InboxItem = { type: string; title: string; href: string; detail?: string; due_on?: string | null; overdue?: boolean }

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!)
const link = (base: string, href: string) => (/^https?:/.test(href) ? href : `${base}${href}`)
const day = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })

function layout(title: string, body: string, base: string, footer: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f4f6fa;font-family:-apple-system,Segoe UI,Arial,sans-serif;color:#1d2433">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #dfe3ea">
<tr><td style="background:#132a5e;padding:12px 20px;color:#ffffff;font-size:14px;font-weight:600">Launchpad</td></tr>
<tr><td style="padding:20px">
<h1 style="margin:0 0 12px;font-size:17px;line-height:1.35;color:#0f1d3d">${title}</h1>
${body}
</td></tr>
<tr><td style="padding:12px 20px;border-top:1px solid #eef1f5;font-size:11.5px;color:#7a8396">${footer} Turn these off from your profile menu in <a href="${base}" style="color:#7a8396">Launchpad</a>.</td></tr>
</table></td></tr></table></body></html>`
}
const button = (href: string, label: string) => `<p style="margin:18px 0 0"><a href="${href}" style="display:inline-block;background:#132a5e;color:#ffffff;text-decoration:none;padding:9px 16px;font-size:13px;font-weight:600">${esc(label)}</a></p>`

type Ask = { key: string; kind: AskKind; title: string; detail: string | null; due_on: string | null; answer: string | null; outcome: string | null; store: string | null; state: string; cases: string[] }

/** To the owner when an ask is given to them, or to whoever raised it when it is answered. */
export function askEmail(a: Ask, event: 'assigned' | 'answered', actor: string | null, toName: string, base: string): Mail {
  const url = `${base}/asks/${a.key}`
  const kind = KIND_LABEL[a.kind].toLowerCase()
  const cases = a.cases.length ? `${a.cases.length} case${a.cases.length === 1 ? '' : 's'} waiting: ${a.cases.slice(0, 12).join(', ')}${a.cases.length > 12 ? ', …' : ''}` : ''
  if (event === 'assigned') {
    const subject = `${a.key}: ${a.title}${a.due_on ? ` (due ${day(a.due_on)})` : ''}`
    const lead = `${actor ?? 'Launchpad'} has given you a ${kind}${a.due_on ? `, due ${day(a.due_on)}` : ''}.`
    return {
      subject,
      text: [`Hi ${toName},`, lead, a.title, a.detail ?? '', cases, url].filter(Boolean).join('\n\n'),
      html: layout(esc(a.title), `<p style="margin:0 0 10px;font-size:13.5px">Hi ${esc(toName)}, ${esc(lead)}</p>
${a.detail ? `<p style="margin:0 0 10px;font-size:13.5px;white-space:pre-wrap">${esc(a.detail)}</p>` : ''}
${cases ? `<p style="margin:0;font-size:12.5px;color:#5b6475">${esc(cases)}</p>` : ''}
${button(url, a.kind === 'question' ? 'Answer it' : a.kind === 'need' ? 'Open the need' : 'Decide')}`, base, `You get this because ${a.key} is yours.`),
    }
  }
  const word = a.state === 'declined' ? 'declined' : DONE_WORD[a.kind]
  const subject = `${a.key} ${word}: ${a.title}`
  const what = [a.outcome && `Outcome: ${a.outcome}`, a.store && `Stored in ${a.store}`, a.answer].filter(Boolean) as string[]
  return {
    subject,
    text: [`Hi ${toName},`, `${actor ?? 'Someone'} ${word} your ${kind}: ${a.title}`, ...what, url].join('\n\n'),
    html: layout(`${esc(a.title)}`, `<p style="margin:0 0 10px;font-size:13.5px">Hi ${esc(toName)}, ${esc(actor ?? 'someone')} ${word} your ${kind}.</p>
${what.map((w) => `<p style="margin:0 0 8px;font-size:13.5px;white-space:pre-wrap">${esc(w)}</p>`).join('')}
${button(url, `Open ${a.key}`)}`, base, `You get this because you raised ${a.key}.`),
  }
}

/** The weekday morning digest: everything waiting on one person, overdue first. */
export function digestEmail(name: string, items: InboxItem[], base: string): Mail {
  const overdue = items.filter((i) => i.overdue).length
  const subject = `${items.length} thing${items.length === 1 ? '' : 's'} waiting on you in Launchpad${overdue ? ` (${overdue} overdue)` : ''}`
  const line = (i: InboxItem) => `${i.overdue ? 'OVERDUE ' : ''}${i.title}${i.detail ? ` (${i.detail})` : ''}${i.due_on ? `, due ${day(i.due_on)}` : ''}`
  const rows = items.map((i) => `<tr><td style="padding:8px 0;border-top:1px solid #eef1f5;font-size:13px">
${i.overdue ? '<span style="color:#c0392b;font-weight:600">Overdue</span> · ' : ''}<a href="${link(base, i.href)}" style="color:#2b57c4;text-decoration:none;font-weight:600">${esc(i.title)}</a>
${i.detail || i.due_on ? `<div style="color:#7a8396;font-size:12px;margin-top:2px">${esc([i.detail, i.due_on && `due ${day(i.due_on)}`].filter(Boolean).join(' · '))}</div>` : ''}
</td></tr>`).join('')
  return {
    subject,
    text: [`Good morning ${name},`, `Waiting on you in Launchpad:`, ...items.map((i) => `- ${line(i)}\n  ${link(base, i.href)}`), `${base}/asks`].join('\n\n'),
    html: layout(`Good morning, ${esc(name)}`, `<p style="margin:0 0 6px;font-size:13.5px">Here is what waits on you today${overdue ? `, ${overdue} of it overdue` : ''}.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>
${button(`${base}/asks`, 'Open Waiting on me')}`, base, 'Sent on weekday mornings while something waits on you.'),
  }
}
