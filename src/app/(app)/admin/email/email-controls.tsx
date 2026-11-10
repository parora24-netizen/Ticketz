'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { toast } from '@/components/toast'
import { sendToMe, setEmailLive } from './actions'

/** Test to yourself first; then turn email on for the team. */
export function EmailControls({ live, configured }: { live: boolean; configured: boolean }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const run = (fn: () => Promise<{ error?: string; note?: string }>, done?: string) => start(async () => {
    const res = await fn()
    if (res.error) toast(res.error, 'error')
    else { toast(res.note ?? done ?? 'Done'); router.refresh() }
  })
  return (
    <div className="flex flex-wrap gap-2 border-t border-[var(--line)] px-4 py-3">
      <button type="button" disabled={!configured || pending} onClick={() => run(() => sendToMe('test'))} className="btn">Send me a test email</button>
      <button type="button" disabled={!configured || pending} onClick={() => run(() => sendToMe('digest'))} className="btn">Send me my digest now</button>
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
