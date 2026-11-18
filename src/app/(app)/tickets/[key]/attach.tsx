'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useTransition } from 'react'
import { EvidenceField, filesIn, useEvidence } from '@/components/evidence'
import { toast } from '@/components/toast'
import { ticketFileFolder } from '@/lib/ticket-files'
import { addTicketAttachments } from './attach-actions'

/**
 * Add screenshots or PDFs to a ticket after it was raised: choose them, drop them anywhere on the
 * page, or press Ctrl+V anywhere on it (a pasted image is never meant for a text box).
 */
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

  // Paste and drop work on the whole page, not only on the box.
  const addRef = useRef(add)
  addRef.current = add
  useEffect(() => {
    const inDialog = (t: EventTarget | null) => t instanceof Element && !!t.closest('dialog, [role="dialog"]')
    const onPaste = (e: ClipboardEvent) => {
      if (inDialog(e.target)) return
      const imgs = filesIn(e.clipboardData).filter((f) => f.type.startsWith('image/'))
      if (imgs.length) { e.preventDefault(); void addRef.current(imgs) }
    }
    const onDragOver = (e: DragEvent) => { if (e.dataTransfer?.types.includes('Files')) e.preventDefault() }
    const onDrop = (e: DragEvent) => {
      if (e.defaultPrevented || inDialog(e.target) || !e.dataTransfer?.types.includes('Files')) return
      e.preventDefault()
      const dropped = filesIn(e.dataTransfer)
      if (dropped.length) void addRef.current(dropped)
    }
    document.addEventListener('paste', onPaste)
    document.addEventListener('dragover', onDragOver)
    document.addEventListener('drop', onDrop)
    return () => {
      document.removeEventListener('paste', onPaste)
      document.removeEventListener('dragover', onDragOver)
      document.removeEventListener('drop', onDrop)
    }
  }, [])

  return (
    <div className="mt-4">
      <EvidenceField ev={{ ...ev, add }} label={hasFiles ? 'Add more' : 'Screenshots'} />
    </div>
  )
}
