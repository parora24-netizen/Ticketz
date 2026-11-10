'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { toast } from '@/components/toast'
import { previewDigest, sendToMe, setEmailLive } from './actions'

/** Test to yourself first; then turn email on for the team. */
export function EmailControls({ live, configured, people }: { live: boolean; configured: boolean; people: { id: string; name: string }[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [who, setWho] = useState('')
  const run = (fn: () => Promise<{ error?: string; note?: string }>, done?: string) => start(async () => {
    const res = await fn()
    if (res.error) toast(res.error, 'error')
    else { toast(res.note ?? done ?? 'Done'); router.refresh() }
  })
  return (
    <div className="flex flex-wrap gap-2 border-t border-[var(--line)] px-4 py-3">
      <button type="button" disabled={!configured || pending} onClick={() => run(() => sendToMe('test'))} className="btn">Send me a test email</button>
      <button type="button" disabled={!configured || pending} onClick={() => run(() => sendToMe('digest'))} className="btn">Send me my digest now</button>
      <span className="flex items-center gap-1">
        <select aria-label="Whose digest" value={who} onChange={(e) => setWho(e.target.value)} className="select h-8 w-40">
          <option value="">Preview a digest for…</option>
          {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button type="button" disabled={!configured || !who || pending} onClick={() => run(() => previewDigest(who))} className="btn">Send me theirs</button>
      </span>
      <button type="button" disabled={!configured || pending} className={`btn ml-auto ${live ? '' : 'btn-primary'}`}
        onClick={() => {
          if (!live && !window.confirm('Turn email on for the whole team? People will get emails for asks and the weekday morning digest.')) return
          run(() => setEmailLive(!live), live ? 'Email is off for the team' : 'Email is on for the team')
        }}>
        {live ? 'Turn off for the team' : 'Turn on for the team'}
      </button>
    </div>
  )
}
