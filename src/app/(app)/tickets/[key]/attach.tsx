'use client'

import { useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { EvidenceField, useEvidence } from '@/components/evidence'
import { toast } from '@/components/toast'
import { ticketFileFolder } from '@/lib/ticket-files'
import { addTicketAttachments } from './attach-actions'

/** Add screenshots or PDFs to a ticket after it was raised: choose, drop or paste them. */
export function TicketAttach({ ticketId, hasFiles }: { ticketId: string; hasFiles: boolean }) {
  const router = useRouter()
  const ev = useEvidence(ticketFileFolder(ticketId))
  const [, start] = useTransition()

  // Upload, then add them to the ticket straight away.
  async function add(list: FileList | File[]) {
    const up = await ev.add(list)
    if (!up.length) return up
    const res = await addTicketAttachments(ticketId, up.map((f) => f.path))
    if (res.error) toast(res.error, 'error')
    else { toast(`${up.length} file${up.length === 1 ? '' : 's'} added`); ev.reset(); start(() => router.refresh()) }
    return up
  }

  return (
    <div className="mt-4" onPaste={(e) => {
      const imgs = [...e.clipboardData.files].filter((f) => f.type.startsWith('image/'))
      if (imgs.length) { e.preventDefault(); void add(imgs) }
    }}>
      <EvidenceField ev={{ ...ev, add }} label={hasFiles ? 'Add more' : 'Screenshots'} />
    </div>
  )
}
