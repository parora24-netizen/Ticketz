'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const LINKS = [
  { href: '/', label: 'Release' },
  { href: '/sprints', label: 'Sprints' },
  { href: '/areas', label: 'Areas' },
  { href: '/cases', label: 'Test cases' },
  { href: '/tickets', label: 'Tickets' },
  { href: '/mine', label: 'My work' },
  { href: '/plan', label: 'Plan' },
  { href: '/admin', label: 'Admin' },
]

export function NavLinks() {
  const path = usePathname()
  return (
    <nav className="flex flex-wrap gap-1 text-sm">
      {LINKS.map((l) => {
        const on = l.href === '/' ? path === '/' : path.startsWith(l.href)
        return (
          <Link key={l.href} href={l.href}
            className={`rounded-md px-2.5 py-1 ${on ? 'bg-[var(--accent-soft)] font-medium text-[var(--accent)]' : 'text-[var(--muted)] hover:text-[var(--ink)]'}`}>
            {l.label}
          </Link>
        )
      })}
    </nav>
  )
}
