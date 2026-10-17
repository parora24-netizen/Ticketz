import Link from 'next/link'
import { getMe } from '@/lib/auth'
import { NavLinks } from './nav-links'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await getMe()
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-[var(--line)] bg-[var(--surface)]">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <Link href="/" className="font-semibold">
            Vulqan <span className="text-[var(--muted)]">26.111</span>
          </Link>
          <NavLinks />
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="text-[var(--muted)]">
              {me.name} · {me.role === 'qa' ? 'QA' : me.role === 'dev' ? 'Dev' : 'Lead'}
            </span>
            <form action="/auth/signout" method="post">
              <button className="btn">Sign out</button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  )
}
