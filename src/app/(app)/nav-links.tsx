'use client'

import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { AdminIcon, CasesIcon, HomeIcon, MoreIcon, ReleaseIcon, SprintIcon, StandupIcon, TicketIcon } from '@/components/icons'

type Item = { href: string; label: string; icon: (p: { className?: string }) => React.ReactNode; match: string[]; lead?: boolean }

/** The process, top to bottom: my work, the sprint where testing happens, its tickets and cases, the daily check-in, the release. */
const ITEMS: Item[] = [
  { href: '/', label: 'For you', icon: HomeIcon, match: ['/mine'] },
  { href: '/sprint', label: 'Sprints', icon: SprintIcon, match: ['/sprint', '/sprints'] },
  { href: '/tickets', label: 'Tickets', icon: TicketIcon, match: ['/tickets'] },
  { href: '/cases', label: 'Test cases', icon: CasesIcon, match: ['/cases'] },
  { href: '/standup', label: 'Standup', icon: StandupIcon, match: ['/standup'] },
  { href: '/release', label: 'Release', icon: ReleaseIcon, match: ['/release', '/plan', '/areas'] },
  { href: '/admin', label: 'Admin', icon: AdminIcon, match: ['/admin'], lead: true },
]

function isOn(item: Item, path: string) {
  if (item.href === '/') return path === '/' || item.match.some((m) => path.startsWith(m))
  return item.match.some((m) => path === m || path.startsWith(`${m}/`))
}

export function Sidebar({ isLead, sprintLabel }: { isLead: boolean; sprintLabel: string | null }) {
  const path = usePathname()
  const items = ITEMS.filter((i) => !i.lead || isLead)
  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[216px] flex-col bg-[var(--navy)] md:flex">
      <Link href="/" className="flex h-14 items-center gap-2.5 px-4" aria-label="Launchpad home">
        <span className="flex h-[34px] items-center rounded-[3px] bg-white px-1.5">
          <Image src="/vulqan-logo.png" alt="" width={20} height={27} priority />
        </span>
        <span className="leading-tight">
          <span className="block text-[14px] font-semibold text-white">Launchpad</span>
          <span className="mono block text-[10px] tracking-[0.08em] text-white/55 uppercase">Releases · 26.111</span>
        </span>
      </Link>
      {sprintLabel && (
        <Link href="/sprint" className="mx-3 mb-2 block bg-white/10 px-3 py-2 text-[11.5px] text-white/80 hover:bg-white/15">
          <span className="mono block text-[10px] tracking-[0.08em] text-white/50 uppercase">Now</span>
          {sprintLabel}
        </Link>
      )}
      <nav className="flex-1 space-y-0.5 px-2 py-1">
        {items.map((i) => {
          const on = isOn(i, path)
          return (
            <Link key={i.href} href={i.href} aria-current={on ? 'page' : undefined}
              className={`flex h-9 items-center gap-3 rounded-[2px] px-3 text-[13px] ${
                on ? 'bg-white font-semibold text-[var(--navy)]' : 'font-medium text-[#e3eaf8] hover:bg-white/10'}`}>
              <i.icon />
              {i.label}
            </Link>
          )
        })}
      </nav>
      <p className="mono px-4 py-3 text-[10px] text-white/40">Vulqan · internal</p>
    </aside>
  )
}

/** Phone: the four most used places plus "More". */
export function BottomBar({ isLead }: { isLead: boolean }) {
  const path = usePathname()
  const [more, setMore] = useState(false)
  useEffect(() => setMore(false), [path])
  const primary = ITEMS.slice(0, 4)
  const rest = ITEMS.slice(4).filter((i) => !i.lead || isLead)
  const restOn = rest.some((i) => isOn(i, path))
  return (
    <>
      {more && (
        <div className="fixed inset-x-0 bottom-14 z-40 border-t border-[var(--line)] bg-white p-2 shadow-[0_-12px_32px_rgba(15,27,51,.18)] md:hidden">
          <form action="/search" role="search" className="px-1 pb-2">
            <input name="q" placeholder="Search tickets and test cases" aria-label="Search tickets and test cases" className="input h-10 w-full" />
          </form>
          {rest.map((i) => (
            <Link key={i.href} href={i.href} className={`flex h-11 items-center gap-3 px-3 text-[14px] ${isOn(i, path) ? 'font-semibold text-[var(--navy)]' : 'text-[var(--ink-2)]'}`}>
              <i.icon />{i.label}
            </Link>
          ))}
        </div>
      )}
      <nav className="fixed inset-x-0 bottom-0 z-40 grid h-14 grid-cols-5 border-t border-[var(--navy)] bg-[var(--navy)] pb-[env(safe-area-inset-bottom)] md:hidden">
        {primary.map((i) => {
          const on = isOn(i, path)
          return (
            <Link key={i.href} href={i.href} aria-current={on ? 'page' : undefined}
              className={`flex flex-col items-center justify-center gap-0.5 text-[10.5px] ${on ? 'font-semibold text-white' : 'text-white/65'}`}>
              <i.icon className="h-5 w-5" />
              {i.label}
            </Link>
          )
        })}
        <button type="button" onClick={() => setMore((v) => !v)} aria-expanded={more}
          className={`flex flex-col items-center justify-center gap-0.5 text-[10.5px] ${more || restOn ? 'font-semibold text-white' : 'text-white/65'}`}>
          <MoreIcon className="h-5 w-5" />
          More
        </button>
      </nav>
    </>
  )
}
