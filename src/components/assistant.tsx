'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

type Msg = { role: 'user' | 'assistant'; text: string }
const KEY = 'assistant-chat'
const EXAMPLES = [
  'What is open on F1, by owner?',
  'Which Critical tickets are blocked or reopened?',
  'How far along is T1? What is left to test?',
  'What is Uday retesting right now?',
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

/** The in-app assistant: free-form questions about the release, answered from the tracker's data. */
export function AssistantButton() {
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
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

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
      copy[copy.length - 1] = { role: 'assistant', text: copy[copy.length - 1].text + d }
      return copy
    })
    try {
      const res = await fetch('/api/assistant', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: history.filter((m) => m.text) }),
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
          const ev = JSON.parse(raw) as { t: string; d?: string; label?: string; message?: string }
          if (ev.t === 'text' && ev.d) { setStatus(null); append(ev.d) }
          else if (ev.t === 'tool') setStatus(ev.label ?? 'Looking things up')
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
      <button type="button" onClick={() => setOpen(true)} className="btn h-8" title="Ask about the release">
        <span aria-hidden>✦</span> Ask
      </button>
      {open && (
        <div className="fixed inset-0 z-40 flex justify-end">
          <button type="button" aria-label="Close" onClick={() => setOpen(false)} className="absolute inset-0 bg-[rgba(15,27,51,.25)]" />
          <aside role="dialog" aria-label="Ask about the release" className="relative flex h-full w-[min(520px,100vw)] flex-col border-l border-[var(--line)] bg-white shadow-[-18px_0_44px_rgba(9,17,38,.18)]">
            <header className="flex items-center gap-2 border-b border-[var(--line)] px-5 py-3">
              <h2 className="text-[16px] font-semibold text-[var(--navy-ink)]">Ask about the release</h2>
              {msgs.length > 0 && <button type="button" disabled={busy} onClick={() => setMsgs([])} className="ml-auto text-[12px] text-[var(--accent)] hover:underline">New chat</button>}
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className={`${msgs.length ? '' : 'ml-auto'} flex h-8 w-8 cursor-pointer items-center justify-center text-[var(--muted)] hover:bg-[var(--surface-3)] hover:text-[var(--ink)]`}>✕</button>
            </header>
            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4 text-[13px] leading-relaxed">
              {msgs.length === 0 && (
                <div className="space-y-2">
                  <p className="text-[var(--muted)]">Ask anything about the tickets, test cases, sprints or team. Answers come from the tracker, as you see it.</p>
                  {EXAMPLES.map((e) => (
                    <button key={e} type="button" onClick={() => void ask(e)} className="block w-full border border-[var(--line)] px-3 py-2 text-left hover:border-[var(--navy)] hover:bg-[var(--surface-3)]">{e}</button>
                  ))}
                </div>
              )}
              {msgs.map((m, i) => m.role === 'user'
                ? <div key={i} className="ml-8 bg-[var(--accent-soft)] px-3 py-2 whitespace-pre-wrap">{m.text}</div>
                : <div key={i}>{m.text ? <Answer text={m.text} /> : null}</div>)}
              {status && <p className="text-[12px] text-[var(--muted)]"><span className="mr-1.5 inline-block animate-pulse">●</span>{status}…</p>}
              <div ref={end} />
            </div>
            <form className="border-t border-[var(--line)] p-3" onSubmit={(e) => { e.preventDefault(); void ask(draft) }}>
              <textarea ref={input} rows={2} value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={4000}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void ask(draft) } }}
                placeholder="Ask a question (Enter to send, Shift+Enter for a new line)" className="input w-full" />
              <div className="mt-2 flex items-center justify-between text-[11px] text-[var(--faint)]">
                <span>Read-only · Claude Opus 5.5</span>
                <button disabled={busy || !draft.trim()} className="btn btn-primary btn-sm">{busy ? 'Answering…' : 'Ask'}</button>
              </div>
            </form>
          </aside>
        </div>
      )}
    </>
  )
}
