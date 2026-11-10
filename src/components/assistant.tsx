'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

type Proposal = { id: string; action: string; input: unknown; fingerprint: string; title: string; lines: string[]; note?: string; status?: 'working' | 'done' | 'cancelled' | 'failed'; result?: string }
type Msg = { role: 'user' | 'assistant'; text: string; proposals?: Proposal[] }
const KEY = 'assistant-chat'
const EXAMPLES = [
  'What is open on S1, by owner?',
  'Which Critical tickets are blocked or reopened?',
  'What is Uday retesting right now?',
  'Move all of Data Exporter to sprint 4',
]

/** Light formatting for answers: paragraphs, bullet and numbered lists, **bold**, `code` and [links](/tickets/…). */
function Inline({ text }: { text: string }) {
  const parts: React.ReactNode[] = []
  const re = /\[([^\]]+)\]\(([^)\s]+)\)|\*\*([^*]+)\*\*|`([^`]+)`/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index))
    if (m[1]) {
      const href = m[2]
      parts.push(href.startsWith('/')
        ? <Link key={m.index} href={href} className="font-medium text-[var(--accent)] hover:underline">{m[1]}</Link>
        : <a key={m.index} href={href} target="_blank" rel="noreferrer" className="text-[var(--accent)] hover:underline">{m[1]}</a>)
    } else if (m[3]) parts.push(<b key={m.index} className="font-semibold">{m[3]}</b>)
    else if (m[4]) parts.push(<code key={m.index} className="mono text-[12px]">{m[4]}</code>)
    last = re.lastIndex
  }
  if (last < text.length) parts.push(text.slice(last))
  return <>{parts}</>
}

// Answers are read line by line: tables (| a | b |), headings, bullet and numbered lists, and
// paragraphs, so a list right under a heading line still renders as a list.
type Block = { kind: 'p'; text: string } | { kind: 'h'; text: string } | { kind: 'ul'; items: string[] } | { kind: 'ol'; items: string[] } | { kind: 'table'; rows: string[][] }
const BULLET = /^\s*([-*•]|\d+\.)\s+/
const cells = (l: string) => l.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim())

function blocks(text: string): Block[] {
  const out: Block[] = []
  for (const raw of text.split('\n')) {
    const l = raw.trimEnd()
    const last = out.at(-1)
    if (!l.trim()) { out.push({ kind: 'p', text: '' }); continue }
    if (/^\s*\|.*\|\s*$/.test(l)) {
      if (/^\s*\|?\s*:?-{2,}/.test(l)) continue // the |---|---| line under the header
      if (last?.kind === 'table') last.rows.push(cells(l))
      else out.push({ kind: 'table', rows: [cells(l)] })
      continue
    }
    if (BULLET.test(l)) {
      const kind = /^\s*\d+\./.test(l) ? 'ol' : 'ul'
      if (last?.kind === kind) last.items.push(l.replace(BULLET, ''))
      else out.push({ kind, items: [l.replace(BULLET, '')] })
      continue
    }
    if (/^#{1,4}\s/.test(l)) { out.push({ kind: 'h', text: l.replace(/^#{1,4}\s/, '') }); continue }
    if (last?.kind === 'p' && last.text) last.text += '\n' + l
    else out.push({ kind: 'p', text: l })
  }
  return out.filter((b) => !(b.kind === 'p' && !b.text))
}

function Answer({ text }: { text: string }) {
  return (
    <div className="space-y-2">
      {blocks(text).map((b, i) => {
        if (b.kind === 'ul') return <ul key={i} className="list-disc space-y-1 pl-5">{b.items.map((it, j) => <li key={j}><Inline text={it} /></li>)}</ul>
        if (b.kind === 'ol') return <ol key={i} className="list-decimal space-y-1 pl-5">{b.items.map((it, j) => <li key={j}><Inline text={it} /></li>)}</ol>
        if (b.kind === 'h') return <p key={i} className="pt-1 font-semibold text-[var(--navy-ink)]"><Inline text={b.text} /></p>
        if (b.kind === 'table') {
          const [head, ...body] = b.rows
          return (
            <div key={i} className="overflow-x-auto">
              <table className="w-full border-collapse text-[12px]">
                <thead><tr>{head.map((c, j) => <th key={j} className="border-b border-[var(--line)] bg-[var(--surface-3)] px-2 py-1 text-left font-semibold whitespace-nowrap"><Inline text={c} /></th>)}</tr></thead>
                <tbody>{body.map((r, k) => <tr key={k}>{r.map((c, j) => <td key={j} className={`border-b border-[var(--line-soft)] px-2 py-1 ${/^[\d.,%—-]+$/.test(c) ? 'mono text-right' : ''}`}><Inline text={c} /></td>)}</tr>)}</tbody>
              </table>
            </div>
          )
        }
        return <p key={i} className="whitespace-pre-wrap"><Inline text={b.text} /></p>
      })}
    </div>
  )
}

/** What the assistant knows of a card when it reads the conversation back. */
const asText = (m: Msg) => [m.text, ...(m.proposals ?? []).map((p) =>
  p.status === 'done' ? `[Done: ${p.result}]` : p.status === 'cancelled' ? `[They cancelled: ${p.title}]` : p.status === 'failed' ? `[Failed: ${p.title}: ${p.result}]` : `[Waiting for them to confirm: ${p.title}]`)].filter(Boolean).join('\n\n')

/** A proposed change: exactly what would happen, and nothing until Confirm. */
function ProposalCard({ p, onConfirm, onCancel }: { p: Proposal; onConfirm: () => void; onCancel: () => void }) {
  return (
    <div className="mt-2 border border-[var(--line)] bg-[var(--surface-3)] px-3 py-2.5">
      <p className="font-semibold text-[var(--navy-ink)]">{p.title}</p>
      <ul className="mt-1 space-y-0.5 text-[12.5px] text-[var(--ink-2)]">{p.lines.map((l, i) => <li key={i} className="whitespace-pre-wrap">{l}</li>)}</ul>
      {p.note && <p className="mt-1 text-[12px] text-[var(--muted)]">{p.note}</p>}
      {!p.status && (
        <div className="mt-2 flex gap-2">
          <button type="button" onClick={onConfirm} className="btn btn-primary btn-sm">Confirm</button>
          <button type="button" onClick={onCancel} className="btn btn-sm">Cancel</button>
        </div>
      )}
      {p.status === 'working' && <p className="mt-2 text-[12px] text-[var(--muted)]">Working…</p>}
      {p.status === 'cancelled' && <p className="mt-2 text-[12px] text-[var(--muted)]">Cancelled. Nothing changed.</p>}
      {p.status === 'done' && <p className="mt-2 text-[12.5px] font-semibold text-[var(--good)]">✓ {p.result}</p>}
      {p.status === 'failed' && <p className="mt-2 text-[12.5px] font-semibold text-[var(--crit)]">{p.result}</p>}
    </div>
  )
}

/** The in-app assistant: questions about the release, answered from the tracker's data, and directions, proposed for the person to confirm. */
export function AssistantButton() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<string | null>(null)
  const end = useRef<HTMLDivElement>(null)
  const input = useRef<HTMLTextAreaElement>(null)

  // The conversation lasts for the browser tab.
  useEffect(() => { try { const s = sessionStorage.getItem(KEY); if (s) setMsgs(JSON.parse(s)) } catch {} }, [])
  useEffect(() => { try { sessionStorage.setItem(KEY, JSON.stringify(msgs)) } catch {} }, [msgs])
  useEffect(() => { end.current?.scrollIntoView({ block: 'end' }) }, [msgs, status])
  useEffect(() => { if (open) input.current?.focus() }, [open])
  // Ctrl+J (⌘J on a Mac) opens or closes Sidekick from anywhere, even while typing elsewhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'j') { e.preventDefault(); setOpen((v) => !v) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const [mac, setMac] = useState(false)
  useEffect(() => setMac(/Mac|iPhone|iPad/.test(navigator.platform)), [])
  const shortcut = mac ? '⌘J' : 'Ctrl+J'
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const setProposal = (id: string, patch: Partial<Proposal>) => setMsgs((ms) => ms.map((m) => (m.proposals?.some((p) => p.id === id)
    ? { ...m, proposals: m.proposals.map((p) => (p.id === id ? { ...p, ...patch } : p)) } : m)))

  async function confirm(p: Proposal) {
    setProposal(p.id, { status: 'working' })
    try {
      const res = await fetch('/api/assistant/apply', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: p.action, input: p.input, fingerprint: p.fingerprint }),
      })
      const out = await res.json() as { error?: string; done?: string }
      if (out.error) setProposal(p.id, { status: 'failed', result: out.error })
      else { setProposal(p.id, { status: 'done', result: out.done ?? 'Done.' }); router.refresh() }
    } catch {
      setProposal(p.id, { status: 'failed', result: 'The connection dropped, so this may not have gone through. Check before trying again.' })
    }
  }

  async function ask(question: string) {
    const q = question.trim()
    if (!q || busy) return
    const history: Msg[] = [...msgs, { role: 'user', text: q }]
    setMsgs([...history, { role: 'assistant', text: '' }])
    setDraft('')
    setBusy(true)
    setStatus('Thinking')
    const append = (d: string) => setMsgs((m) => {
      const copy = [...m]
      copy[copy.length - 1] = { ...copy[copy.length - 1], text: copy[copy.length - 1].text + d }
      return copy
    })
    try {
      const res = await fetch('/api/assistant', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history.map((m) => ({ role: m.role, text: asText(m) })).filter((m) => m.text) }),
      })
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: 'Something went wrong' }))
        append(err.error ?? 'Something went wrong')
        return
      }
      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let buf = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        let nl: number
        while ((nl = buf.indexOf('\n')) >= 0) {
          const raw = buf.slice(0, nl)
          buf = buf.slice(nl + 1)
          if (!raw.trim()) continue
          const ev = JSON.parse(raw) as { t: string; d?: string; label?: string; message?: string; proposal?: Proposal }
          if (ev.t === 'text' && ev.d) { setStatus(null); append(ev.d) }
          else if (ev.t === 'tool') setStatus(ev.label ?? 'Looking things up')
          else if (ev.t === 'proposal' && ev.proposal) {
            const proposal = ev.proposal
            setMsgs((m) => {
              const copy = [...m]
              const last = copy[copy.length - 1]
              copy[copy.length - 1] = { ...last, proposals: [...(last.proposals ?? []), proposal] }
              return copy
            })
          }
          else if (ev.t === 'error') append(`\n\n${ev.message}`)
        }
      }
    } catch {
      append('\n\nThe connection dropped. Try again.')
    } finally {
      setBusy(false)
      setStatus(null)
    }
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn h-8 gap-1.5" title={`Sidekick: ask about the release, or tell it what to change (${shortcut})`} aria-keyshortcuts="Control+J Meta+J">
        <span aria-hidden className="text-[var(--accent)]">✦</span>
        <span>Sidekick</span>
        <kbd className="mono ml-1 hidden border border-[var(--line)] bg-[var(--surface-3)] px-1 text-[10px] font-normal text-[var(--muted)] lg:inline">{shortcut}</kbd>
      </button>
      {open && (
        <div className="fixed inset-0 z-40 flex justify-end">
          <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="absolute inset-0 bg-[rgba(15,27,51,.25)]" />
          <aside role="dialog" aria-label="Sidekick" className="relative flex h-full w-[min(520px,100vw)] flex-col border-l border-[var(--line)] bg-white shadow-[-18px_0_44px_rgba(9,17,38,.18)]">
            <header className="flex items-center gap-2 border-b border-[var(--line)] px-5 py-3">
              <h2 className="text-[16px] font-semibold text-[var(--navy-ink)]"><span aria-hidden className="mr-1.5 text-[var(--accent)]">✦</span>Sidekick</h2>
              {msgs.length > 0 && <button type="button" disabled={busy} onClick={() => setMsgs([])} className="ml-auto text-[12px] text-[var(--accent)] hover:underline">New chat</button>}
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className={`${msgs.length ? '' : 'ml-auto'} flex h-8 w-8 cursor-pointer items-center justify-center text-[var(--muted)] hover:bg-[var(--surface-3)] hover:text-[var(--ink)]`}>✕</button>
            </header>
            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4 text-[13px] leading-relaxed">
              {msgs.length === 0 && (
                <div className="space-y-2">
                  <p className="text-[var(--muted)]">Ask anything about the tickets, test cases, sprints or team, or tell it what to change. It shows you exactly what would happen, and changes nothing until you confirm.</p>
                  {EXAMPLES.map((e) => (
                    <button key={e} type="button" onClick={() => void ask(e)} className="block w-full border border-[var(--line)] px-3 py-2 text-left hover:border-[var(--navy)] hover:bg-[var(--surface-3)]">{e}</button>
                  ))}
                </div>
              )}
              {msgs.map((m, i) => m.role === 'user'
                ? <div key={i} className="ml-8 bg-[var(--accent-soft)] px-3 py-2 whitespace-pre-wrap">{m.text}</div>
                : <div key={i}>
                  {m.text ? <Answer text={m.text} /> : null}
                  {m.proposals?.map((p) => <ProposalCard key={p.id} p={p} onConfirm={() => void confirm(p)} onCancel={() => setProposal(p.id, { status: 'cancelled' })} />)}
                </div>)}
              {status && <p className="text-[12px] text-[var(--muted)]"><span className="mr-1.5 inline-block animate-pulse">●</span>{status}…</p>}
              <div ref={end} />
            </div>
            <form className="border-t border-[var(--line)] p-3" onSubmit={(e) => { e.preventDefault(); void ask(draft) }}>
              <textarea ref={input} rows={2} value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={4000}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void ask(draft) } }}
                placeholder="Ask a question or give a direction (Enter to send, Shift+Enter for a new line)" className="input w-full" />
              <div className="mt-2 flex items-center justify-between text-[11px] text-[var(--faint)]">
                <span>Changes only what you confirm · Claude Opus 5.5 · {shortcut} to open or close</span>
                <button disabled={busy || !draft.trim()} className="btn btn-primary btn-sm">{busy ? 'Answering…' : 'Send'}</button>
              </div>
            </form>
          </aside>
        </div>
      )}
    </>
  )
}
