'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { toast } from '@/components/toast'
import { removeTicketAttachment } from './attach-actions'

/** Remove one screenshot from a ticket, after a confirm. Shown to whoever added it, and leads. */
export function RemoveShot({ ticketId, path, name }: { ticketId: string; path: string; name: string }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  return (
    <button type="button" disabled={pending} aria-label={`Remove ${name}`}
      className="mt-1 block text-[11.5px] text-[var(--muted)] hover:text-[var(--crit)] disabled:opacity-60"
      onClick={() => {
        if (!window.confirm(`Remove ${name} from this ticket? This cannot be undone.`)) return
        start(async () => {
          const res = await removeTicketAttachment(ticketId, path)
          if (res.error) toast(res.error, 'error')
          else { toast(`${name} removed`); router.refresh() }
        })
      }}>
      {pending ? 'Removing…' : 'Remove'}
    </button>
  )
}
