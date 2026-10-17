import Link from 'next/link'

/** Page-level tabs: views of one place, rather than separate screens. */
export function Tabs({ items, active }: { items: { href: string; label: string; key: string }[]; active: string }) {
  return (
    <nav className="mb-5 flex gap-1 border-b border-[var(--line)]" aria-label="Views">
      {items.map((t) => (
        <Link key={t.key} href={t.href} aria-current={t.key === active ? 'page' : undefined}
          className={`-mb-px border-b-2 px-3 pb-2 text-[13px] ${
            t.key === active ? 'border-[var(--navy)] font-semibold text-[var(--navy)]' : 'border-transparent text-[var(--muted)] hover:text-[var(--ink)]'}`}>
          {t.label}
        </Link>
      ))}
    </nav>
  )
}

export const RELEASE_TABS = [
  { key: 'overview', href: '/release', label: 'Overview' },
  { key: 'plan', href: '/plan', label: 'Plan' },
  { key: 'areas', href: '/areas', label: 'Areas' },
]

/** The running sprint's board (or the next one, before any has started), then all sprints. */
export function sprintTabs(now: { id: string; name: string; running: boolean } | null) {
  return [
    ...(now ? [{ key: 'board', href: `/sprints/${now.id}`, label: now.running ? `Board · ${now.name}` : `Next · ${now.name}` }] : []),
    { key: 'all', href: '/sprints', label: 'All sprints' },
  ]
}

export function nowSprint<S extends { id: string; name: string; status: string; starts_on: string }>(sprints: S[], current: S | null) {
  if (current) return { id: current.id, name: current.name, running: true }
  const next = sprints.find((s) => s.status === 'planned')
  return next ? { id: next.id, name: next.name, running: false } : null
}
