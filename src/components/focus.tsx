'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { setTicketFocus } from '@/app/(app)/actions'
import { toast } from '@/components/toast'

/** The star on a ticket the team is working on first. */
export function FocusStar({ className = '' }: { className?: string }) {
  return <span title="Focus: the team is working on this first" aria-label="Focus" className={`text-[var(--warn)] ${className}`}>★</span>
}

/** A lead's toggle on the ticket page: mark it as a focus, or take the mark off. */
export function FocusToggle({ ticketId, focus }: { ticketId: string; focus: boolean }) {
  const router = useRouter()
  const [on, setOn] = useState(focus)
  const [pending, start] = useTransition()
  return (
    <button type="button" disabled={pending} aria-pressed={on}
      className={`btn ${on ? 'border-[var(--warn-line)] bg-[var(--warn-soft)] text-[var(--warn)]' : ''}`}
      onClick={() => start(async () => {
        const res = await setTicketFocus([ticketId], !on)
        if (res.error) toast(res.error, 'error')
        else { setOn(!on); toast(!on ? 'Marked as focus' : 'Focus taken off'); router.refresh() }
      })}>
      {on ? '★ Focus' : '☆ Mark as focus'}
    </button>
  )
}
