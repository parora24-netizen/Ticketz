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
    <nav className="-mx-1 flex gap-0.5 overflow-x-auto">
      {LINKS.map((l) => {
        const on = l.href === '/' ? path === '/' : path.startsWith(l.href)
        return (
          <Link key={l.href} href={l.href} aria-current={on ? 'page' : undefined}
            className={`flex h-[30px] items-center rounded-[2px] px-3.5 text-[13px] whitespace-nowrap ${
              on ? 'bg-white font-semibold text-[var(--navy)]' : 'font-medium text-[#e3eaf8] hover:bg-white/10'
            }`}>
            {l.label}
          </Link>
        )
      })}
    </nav>
  )
}
