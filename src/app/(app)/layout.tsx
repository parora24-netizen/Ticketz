import Image from 'next/image'
import Link from 'next/link'
import { getMe } from '@/lib/auth'
import { RELEASE_DATE, daysUntil } from '@/lib/data'
import { NavLinks } from './nav-links'

const ROLE = { lead: 'Lead', dev: 'Dev', qa: 'QA' } as const

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await getMe()
  const initials = me.name.split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-20">
        <div className="flex h-12 items-center gap-3.5 bg-[var(--navy)] px-4">
          <Link href="/" className="flex h-[34px] items-center rounded-[3px] bg-white px-2" aria-label="Vulqan release tracker home">
            <Image src="/vulqan-logo.png" alt="Vulqan" width={23} height={31} priority />
          </Link>
          <div className="h-5 w-px bg-white/25" />
          <div className="flex h-[30px] items-center bg-white/15 px-3 text-[13px] font-medium whitespace-nowrap text-white">
            Release 26.111
          </div>
          <span className="mono hidden text-[11px] text-white/60 sm:inline">{daysUntil(RELEASE_DATE)} days to release</span>
          <div className="ml-auto flex items-center gap-2.5">
            <span className="hidden text-[12.5px] text-white/80 md:inline">{me.name} · {ROLE[me.role]}</span>
            <div className="flex h-[30px] w-[30px] items-center justify-center rounded-[2px] bg-[#2b57c4] text-[11px] font-semibold text-white" title={`${me.name} · ${ROLE[me.role]}`}>
              {initials}
            </div>
            <form action="/auth/signout" method="post">
              <button className="flex h-[30px] items-center rounded-[2px] bg-white/15 px-3 text-[12.5px] font-medium text-white hover:bg-white/25">Sign out</button>
            </form>
          </div>
        </div>
        <div className="flex h-12 items-center border-b border-[var(--navy)] bg-[var(--navy-2)] px-4">
          <NavLinks />
        </div>
      </header>
      <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6">{children}</main>
    </div>
  )
}
