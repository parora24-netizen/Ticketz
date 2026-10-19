'use client'

import { useState, useTransition } from 'react'
import { toast } from '@/components/toast'
import { revealCiToken } from '@/app/(app)/actions'

const copy = (text: string, what: string) =>
  navigator.clipboard.writeText(text).then(() => toast(`${what} copied`), () => toast('Copy failed; select the text instead', 'error'))

/** A CI token behind dots: Reveal shows it, Copy puts it on the clipboard. */
export function TokenCell({ id, revealable }: { id: string; revealable: boolean }) {
  const [token, setToken] = useState<string | null>(null)
  const [shown, setShown] = useState(false)
  const [pending, start] = useTransition()
  if (!revealable) return <span className="text-[12px] text-[var(--muted)]">Shown once when made</span>

  const get = (then: (t: string) => void) => {
    if (token) return then(token)
    start(async () => {
      const res = await revealCiToken(id)
      if (res.error || !res.token) toast(res.error ?? 'Could not read the token', 'error')
      else { setToken(res.token); then(res.token) }
    })
  }
  return (
    <span className="flex min-w-0 items-center gap-2">
      <code className="mono min-w-0 truncate text-[12px]">{shown && token ? token : 'vqt_••••••••••••••••'}</code>
      <button type="button" disabled={pending} className="btn btn-sm" onClick={() => (shown ? setShown(false) : get(() => setShown(true)))}>
        {shown ? 'Hide' : 'Reveal'}
      </button>
      <button type="button" disabled={pending} className="btn btn-sm" onClick={() => get((t) => void copy(t, 'Token'))}>Copy</button>
    </span>
  )
}

/** How the automated suite posts results, ready to paste into CI. */
export function PayloadExample({ appUrl }: { appUrl: string }) {
  const curl = `curl -X POST "${appUrl}/api/results" \\
  -H "Authorization: Bearer $TRACKER_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{
    "build": "b39a5eab1",
    "run_id": "codebuild-1234",
    "results": [
      { "tc_id": "TC_FN_070", "status": "passed", "duration_ms": 5400 },
      { "tc_id": "TC_FN_071", "status": "failed", "error": "Expected error text not shown", "url": "https://reports.example/1234#TC_FN_071" },
      { "tc_id": "TC_FN_072", "status": "skipped" },
      { "tc_id": "TC_FN_073", "status": "known_defect" }
    ]
  }'`
  return (
    <section className="card mt-4">
      <header className="flex items-center gap-3 border-b border-[var(--line)] px-4 py-2.5">
        <h2 className="text-[14px] font-semibold text-[var(--navy-ink)]">Posting results</h2>
        <button type="button" className="btn btn-sm ml-auto" onClick={() => void copy(curl, 'Example')}>Copy</button>
      </header>
      <pre className="mono overflow-x-auto bg-[var(--surface-3)] px-4 py-3 text-[12px] leading-relaxed">{curl}</pre>
      <dl className="grid grid-cols-[max-content_1fr] gap-x-4 gap-y-1.5 border-t border-[var(--line)] px-4 py-3 text-[12.5px]">
        <dt className="mono text-[var(--muted)]">status</dt><dd>passed, failed, skipped or known_defect</dd>
        <dt className="mono text-[var(--muted)]">tc_id</dt><dd>the Test Case ID, e.g. TC_FN_070; unknown ids come back as unmatched</dd>
        <dt className="mono text-[var(--muted)]">build, run_id</dt><dd>optional; shown on each result</dd>
        <dt className="mono text-[var(--muted)]">limits</dt><dd>up to 5,000 results per call; a test reported twice keeps its last result</dd>
        <dt className="mono text-[var(--muted)]">lands in</dt><dd>the running test sprint; the response lists recorded, sprint and unmatched</dd>
      </dl>
    </section>
  )
}
