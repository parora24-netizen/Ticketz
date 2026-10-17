'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

const TITLES: [string, string][] = [
  ['/standup', 'Standup'],
  ['/sprints', 'Sprint'],
  ['/sprint', 'Sprint'],
  ['/tickets/new', 'New ticket'],
  ['/tickets', 'Tickets'],
  ['/cases/new', 'New test case'],
  ['/cases/import', 'Import test cases'],
  ['/cases', 'Test cases'],
  ['/release', 'Release'],
  ['/plan', 'Release'],
  ['/areas', 'Release'],
  ['/admin', 'Admin'],
  ['/search', 'Search'],
]

const SEGMENT: Record<string, string> = { new: 'New', import: 'Import' }
const isId = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(s)

/** Page name and a clickable trail back up, top left, on every screen. */
export function PageTitle() {
  const path = usePathname()
  const match = TITLES.find(([p]) => path === p || path.startsWith(`${p}/`))
  const title = path === '/' ? 'For you' : match?.[1] ?? ''
  const base = match ? `/${match[0].split('/')[1]}` : '/'
  const rest = path.slice(base.length).split('/').filter(Boolean).filter((s) => !isId(s))
  const crumbs = rest.length && !SEGMENT[rest[0]] ? rest.map((s) => SEGMENT[s] ?? decodeURIComponent(s)) : []
  return (
    <nav aria-label="Breadcrumb" className="flex min-w-0 items-baseline gap-1.5">
      {crumbs.length ? (
        <>
          <a href={base === '/sprint' ? '/sprints' : base} className="truncate text-[15px] font-semibold text-[var(--muted)] hover:text-[var(--navy)]">{title}</a>
          {crumbs.map((c, i) => (
            <span key={i} className="flex min-w-0 items-baseline gap-1.5">
              <span className="text-[var(--faint)]">/</span>
              <span className="mono truncate text-[14px] font-semibold text-[var(--navy-ink)]">{c}</span>
            </span>
          ))}
        </>
      ) : (
        <>
          <h1 className="truncate text-[17px] font-semibold text-[var(--navy-ink)]">{title}</h1>
          <span className="mono hidden truncate text-[12px] text-[var(--faint)] sm:inline">{path}</span>
        </>
      )}
    </nav>
  )
}

/** "/" jumps to search; "c" presses the page's own create button, if it has one. */
export function Shortcuts() {
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement
      if (e.ctrlKey || e.metaKey || e.altKey || t.closest('input,textarea,select,[contenteditable="true"],dialog')) return
      if (e.key === '/') {
        e.preventDefault()
        document.querySelector<HTMLInputElement>('#global-search')?.focus()
      } else if (e.key === 'c') {
        e.preventDefault()
        document.querySelector<HTMLElement>('[data-create]')?.click()
      }
    }
    window.addEventListener('keydown', on)
    return () => window.removeEventListener('keydown', on)
  }, [])
  return null
}

const DENSITIES = [
  { key: 'compact', label: 'Compact', hint: 'More rows on screen. Best for the full grid.' },
  { key: 'balanced', label: 'Balanced', hint: 'The default.' },
  { key: 'airy', label: 'Airy', hint: 'More room per row.' },
] as const
type Density = (typeof DENSITIES)[number]['key']

function readDensity(): Density {
  try {
    const v = localStorage.getItem('density')
    return v === 'compact' || v === 'airy' ? v : 'balanced'
  } catch {
    return 'balanced'
  }
}

/** Applies the saved row density before the grids paint. */
export function DensityInit() {
  useEffect(() => {
    document.documentElement.dataset.density = readDensity()
  }, [])
  return null
}

/** Avatar menu: who you are, row density for this device, sign out. */
export function ProfileMenu({ name, email, role, initials }: { name: string; email: string; role: string; initials: string }) {
  const [open, setOpen] = useState(false)
  const [density, setDensity] = useState<Density>('balanced')
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => setDensity(readDensity()), [])
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', close)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', close) }
  }, [open])
  function pick(d: Density) {
    setDensity(d)
    document.documentElement.dataset.density = d
    try { localStorage.setItem('density', d) } catch {}
  }
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="menu" className="flex items-center gap-2.5">
        <span className="hidden text-right leading-tight lg:block">
          <span className="block text-[12.5px] font-semibold text-[var(--ink)]">{name}</span>
          <span className="mono block text-[11px] text-[var(--faint)]">{email}</span>
        </span>
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[11px] font-semibold text-[var(--navy)]">{initials}</span>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-40 mt-2 w-72 border border-[var(--line)] bg-white shadow-[0_18px_44px_rgba(9,17,38,.24)]">
          <div className="border-b border-[var(--line-soft)] px-4 py-3">
            <div className="text-[14px] font-semibold">{name}</div>
            <div className="mono text-[11.5px] text-[var(--muted)]">{email}</div>
            <div className="label mt-1">{role}</div>
          </div>
          <div className="border-b border-[var(--line-soft)] px-4 py-3">
            <div className="label">Row density</div>
            <div className="mt-2 grid grid-cols-3 border border-[var(--line)] p-0.5">
              {DENSITIES.map((d) => (
                <button key={d.key} type="button" onClick={() => pick(d.key)}
                  className={`h-7 text-[12.5px] ${density === d.key ? 'bg-[var(--navy)] font-semibold text-white' : 'text-[var(--ink-2)] hover:bg-[var(--surface-3)]'}`}>
                  {d.label}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[11.5px] text-[var(--muted)]">{DENSITIES.find((d) => d.key === density)?.hint} Saved on this device.</p>
          </div>
          <form action="/auth/signout" method="post" className="p-3">
            <button className="btn btn-primary w-full">Sign out</button>
          </form>
        </div>
      )}
    </div>
  )
}
