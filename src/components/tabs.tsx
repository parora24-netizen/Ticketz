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

export function sprintTabs(currentId: string | null) {
  return [
    ...(currentId ? [{ key: 'board', href: `/sprints/${currentId}`, label: 'Board' }] : []),
    { key: 'all', href: '/sprints', label: 'All sprints' },
  ]
}
