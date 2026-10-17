'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

/** The top bar's "Create" button: the few things people add, one click away from any page. */
export function CreateMenu({ canAddCases }: { canAddCases: boolean }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', close)
    }
  }, [open])
  const items = [
    { href: '/tickets/new', label: 'Ticket', hint: 'A defect or a problem with a test' },
    ...(canAddCases
      ? [
          { href: '/cases/new', label: 'Test case', hint: 'One case, with steps' },
          { href: '/cases/import', label: 'Import test cases', hint: 'From Excel, CSV or pasted cells' },
        ]
      : []),
  ]
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="menu"
        className="flex h-[30px] items-center gap-1.5 rounded-[2px] bg-white px-3 text-[13px] font-semibold text-[var(--navy)] hover:bg-[#e8effb]">
        <span aria-hidden className="text-[15px] leading-none">+</span> Create
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-30 mt-1 w-64 border border-[var(--line)] bg-white py-1 shadow-[0_18px_44px_rgba(9,17,38,.24)]">
          {items.map((i) => (
            <Link key={i.href} href={i.href} role="menuitem" onClick={() => setOpen(false)} className="block px-3 py-2 hover:bg-[var(--accent-soft)]">
              <div className="text-[13px] font-semibold text-[var(--navy-ink)]">{i.label}</div>
              <div className="text-[11.5px] text-[var(--muted)]">{i.hint}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
