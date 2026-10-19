import Image from 'next/image'
import Link from 'next/link'
import { SearchIcon } from '@/components/icons'
import { DensityInit, PageTitle, ProfileMenu, Shortcuts } from '@/components/shell'
import { Toaster } from '@/components/toast'
import { getMe } from '@/lib/auth'
import { currentSprint, daysLeft, daysUntil, fmtDate, loadSprints } from '@/lib/data'
import { BottomBar, Sidebar } from './nav-links'

const ROLE = { lead: 'Lead', dev: 'Developer', qa: 'QA' } as const

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [me, sprints] = await Promise.all([getMe(), loadSprints()])
  const sprint = currentSprint(sprints)
  const sprintLabel = sprint
    ? `${sprint.name} · ${fmtDate(sprint.starts_on)} to ${fmtDate(sprint.ends_on)} · ${daysLeft(sprint.ends_on)}`
    : null
  const words = me.name.trim().split(/\s+/)
  const initials = (words.length > 1 ? words[0][0] + words[1][0] : me.name.slice(0, 2)).toUpperCase()
  return (
    <div className="min-h-screen">
      <DensityInit />
      <Shortcuts />
      <Toaster />
      <Sidebar isLead={me.role === 'lead'} sprintLabel={sprintLabel} />
      <div className="md:pl-[216px]">
        <header className="sticky top-0 z-20 flex h-14 items-center gap-4 border-b border-[var(--line)] bg-white px-4 sm:px-6">
          <Link href="/" className="flex h-[32px] shrink-0 items-center rounded-[3px] bg-[var(--navy)] px-1.5 md:hidden" aria-label="Home">
            <span className="flex h-[26px] items-center rounded-[2px] bg-white px-1"><Image src="/vulqan-logo.png" alt="" width={15} height={20} /></span>
          </Link>
          <PageTitle />
          <div className="ml-auto flex items-center gap-3">
            <form action="/search" role="search" className="relative hidden md:block">
              <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 h-4 w-4 -translate-y-1/2 text-[var(--faint)]" />
              <input id="global-search" name="q" placeholder="Jump to TC_FN_070, DEV-…   ( / )" aria-label="Search tickets and test cases" className="input h-8 w-72 pl-8" />
            </form>
            <ProfileMenu name={me.name} email={me.email} role={ROLE[me.role]} initials={initials} />
          </div>
        </header>
        <main className="px-4 pt-5 pb-24 sm:px-6 md:pb-8">{children}</main>
      </div>
      <BottomBar isLead={me.role === 'lead'} />
    </div>
  )
}
