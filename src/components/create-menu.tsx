'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

/** The sidebar's "Create" button: the few things people add, one click away from any page. */
export function CreateMenu({ canAddCases, block }: { canAddCases: boolean; block?: boolean }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const show = () => setOpen(true)
    window.addEventListener('open-create', show)
    return () => window.removeEventListener('open-create', show)
  }, [])
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
        className={`flex h-[34px] items-center gap-1.5 rounded-[2px] bg-white px-3 text-[13px] font-semibold text-[var(--navy)] hover:bg-[#e8effb] ${block ? 'w-full justify-center' : ''}`}>
        <span aria-hidden className="text-[15px] leading-none">+</span> Create
        <kbd className="mono ml-1 hidden border border-[var(--line)] px-1 text-[10px] font-normal text-[var(--faint)] md:inline">C</kbd>
      </button>
      {open && (
        <div role="menu" className={`absolute z-40 mt-1 w-64 ${block ? 'left-0' : 'right-0'} border border-[var(--line)] bg-white py-1 shadow-[0_18px_44px_rgba(9,17,38,.24)]`}>
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
