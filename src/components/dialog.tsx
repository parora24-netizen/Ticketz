'use client'

import { useEffect, useRef } from 'react'

/** A modal built on <dialog>: Escape and the backdrop close it, focus stays inside. */
export function Dialog({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])
  return (
    <dialog ref={ref} onClose={onClose} onClick={(e) => { if (e.target === ref.current) onClose() }}
      className={`m-auto ${wide ? 'w-[min(860px,calc(100vw-32px))]' : 'w-[min(440px,calc(100vw-32px))]'} border border-[var(--line)] bg-white p-0 shadow-[0_18px_48px_rgba(15,27,51,.24)] backdrop:bg-[rgba(15,27,51,.45)]`}>
      <div className="flex items-center justify-between border-b border-[var(--line)] px-4 py-3">
        <h2 className="text-[16px] font-semibold text-[var(--navy-ink)]">{title}</h2>
        <button type="button" onClick={onClose} aria-label="Close" className="text-[var(--muted)] hover:text-[var(--ink)]">✕</button>
      </div>
      <div className="max-h-[75vh] overflow-y-auto p-4">{children}</div>
    </dialog>
  )
}
