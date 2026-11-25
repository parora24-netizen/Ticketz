
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

/** To someone tagged in a comment on an ask, to whoever it is handed to, or to the owner it comes back to. */
export function askCommentEmail(a: { key: string; title: string }, body: string, actor: string, toName: string, why: 'tagged' | 'handed' | 'back', base: string): Mail {
  const url = `${base}/asks/${a.key}`
  const lead = why === 'handed' ? `${actor} has handed you ${a.key} until you reply.` : why === 'back' ? `${actor} replied on ${a.key}, and it is back with you.` : `${actor} tagged you on ${a.key}.`
  return {
    subject: `${why === 'tagged' ? `${actor} tagged you` : why === 'handed' ? `${actor} handed you` : `${actor} replied`}: ${a.key} ${a.title}`,
    text: [`Hi ${toName},`, lead, a.title, body, url].join('\n\n'),
    html: layout(esc(a.title), `<p style="margin:0 0 10px;font-size:13.5px">Hi ${esc(toName)}, ${esc(lead)}</p>
<blockquote style="margin:0 0 10px;padding:8px 12px;border-left:3px solid #c9d2e3;font-size:13.5px;white-space:pre-wrap">${esc(body)}</blockquote>
${button(url, why === 'tagged' ? 'Reply' : `Open ${a.key}`)}`, base, why === 'tagged' ? `You get this because ${actor} tagged you.` : `You get this because ${a.key} is yours.`),
  }
}

export type DigestAsk = { key: string; title: string; zone?: string; due_on?: string | null; outcome?: string; fresh?: boolean }
/** One person's asks for the morning: how many are open, which are new or overdue, and which they raised were answered, to close. */
export type DigestAsks = { open: number; overdue: DigestAsk[]; fresh: DigestAsk[]; toClose: DigestAsk[]; since: string }

const ASK_TYPES = new Set(['need', 'question', 'decision', 'close'])

/**
 * The weekday morning digest: the person's asks first (open, new since the last digest, overdue,
 * and answered ones they raised, to check and close), then everything else waiting on them.
 */
export function digestEmail(name: string, items: InboxItem[], base: string, asks?: DigestAsks): Mail {
  const rest = asks ? items.filter((i) => !ASK_TYPES.has(i.type)) : items
  const overdue = rest.filter((i) => i.overdue).length
  const n = (k: number, one: string, many = `${one}s`) => `${k} ${k === 1 ? one : many}`
  const sinceDay = asks ? new Date(asks.since).toLocaleDateString('en-GB', { weekday: 'long', timeZone: 'Asia/Kolkata' }) : ''
  const subject = asks
    ? [`${n(asks.open, 'open ask')}${asks.fresh.length ? ` (${asks.fresh.length} new)` : ''}`, asks.overdue.length && `${asks.overdue.length} overdue`, asks.toClose.length && `${asks.toClose.length} to close`, rest.length && n(rest.length, 'other thing')].filter(Boolean).join(', ') + ' · Launchpad'
    : `${n(items.length, 'thing')} waiting on you in Launchpad${overdue ? ` (${overdue} overdue)` : ''}`
  const askHref = (k: string) => `${base}/asks/${k}`
  const askRow = (x: DigestAsk, extra?: string) => `<tr><td style="padding:6px 0;border-top:1px solid #eef1f5;font-size:13px">
<a href="${askHref(x.key)}" style="color:#2b57c4;text-decoration:none;font-weight:600">${esc(x.key)}</a> ${esc(x.title)}
${[x.zone, extra].filter(Boolean).length ? `<div style="color:#7a8396;font-size:12px;margin-top:2px">${esc([x.zone, extra].filter(Boolean).join(' · '))}</div>` : ''}
</td></tr>`
  const list = (title: string, rows: DigestAsk[], extra: (x: DigestAsk) => string | undefined, cap = 20) => rows.length ? `
<h2 style="margin:18px 0 4px;font-size:13.5px;color:#0f1d3d">${esc(title)}</h2>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows.slice(0, cap).map((x) => askRow(x, extra(x))).join('')}</table>
${rows.length > cap ? `<p style="margin:6px 0 0;font-size:12.5px"><a href="${base}/asks" style="color:#2b57c4">and ${rows.length - cap} more</a></p>` : ''}` : ''
  const stat = (k: number, label: string, red = false) => `<td style="padding:10px 12px;border:1px solid #dfe3ea;text-align:center;width:33%">
<a href="${base}/asks" style="text-decoration:none"><div style="font-size:22px;font-weight:700;color:${red && k ? '#c0392b' : '#0f1d3d'}">${k}</div><div style="font-size:11.5px;color:#7a8396">${esc(label)}</div></a></td>`
  const asksHtml = asks ? `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse"><tr>
${stat(asks.open, 'open asks')}${stat(asks.fresh.length, `new since ${sinceDay}`)}${stat(asks.overdue.length, 'overdue', true)}
</tr></table>
${list(`New since ${sinceDay}`, asks.fresh, (x) => x.due_on ? `due ${day(x.due_on)}` : undefined)}
${list('Overdue', asks.overdue, (x) => x.due_on ? `was due ${day(x.due_on)}` : undefined, 10)}
${list('Answered: check and close (or send back)', asks.toClose, (x) => [x.outcome, x.fresh && 'new'].filter(Boolean).join(' · '))}` : ''
  const rows = rest.map((i) => `<tr><td style="padding:8px 0;border-top:1px solid #eef1f5;font-size:13px">
${i.overdue ? '<span style="color:#c0392b;font-weight:600">Overdue</span> · ' : ''}<a href="${link(base, i.href)}" style="color:#2b57c4;text-decoration:none;font-weight:600">${esc(i.title)}</a>
${i.detail || i.due_on ? `<div style="color:#7a8396;font-size:12px;margin-top:2px">${esc([i.detail, i.due_on && `due ${day(i.due_on)}`].filter(Boolean).join(' · '))}</div>` : ''}
</td></tr>`).join('')
  const line = (i: InboxItem) => `${i.overdue ? 'OVERDUE ' : ''}${i.title}${i.detail ? ` (${i.detail})` : ''}${i.due_on ? `, due ${day(i.due_on)}` : ''}`
  const textAsks = asks ? [
    `Asks: ${asks.open} open, ${asks.fresh.length} new since ${sinceDay}, ${asks.overdue.length} overdue. ${base}/asks`,
    ...asks.fresh.slice(0, 20).map((x) => `- New: ${x.key} ${x.title}\n  ${askHref(x.key)}`),
    ...asks.overdue.slice(0, 10).map((x) => `- Overdue: ${x.key} ${x.title}\n  ${askHref(x.key)}`),
    ...asks.toClose.slice(0, 20).map((x) => `- Answered (${x.outcome}), to close: ${x.key} ${x.title}\n  ${askHref(x.key)}`),
  ] : []
  return {
    subject,
    text: [`Good morning ${name},`, ...textAsks, ...(rest.length ? [asks ? 'Also waiting on you:' : 'Waiting on you in Launchpad:', ...rest.map((i) => `- ${line(i)}\n  ${link(base, i.href)}`)] : []), `${base}/asks`].join('\n\n'),
    html: layout(`Good morning, ${esc(name)}`, `${asksHtml}
${rest.length ? `<h2 style="margin:18px 0 4px;font-size:13.5px;color:#0f1d3d">${asks ? 'Also waiting on you' : `Waiting on you today${overdue ? `, ${overdue} overdue` : ''}`}</h2>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows}</table>` : ''}
${button(`${base}/asks`, 'Open Waiting on me')}`, base, 'Sent at 10:00 on weekday mornings. Tags in an ask\'s discussion still come as they happen.'),
  }
}
