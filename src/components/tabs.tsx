import { sprintHref } from '@/lib/links'
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
type NowSprint = { id: string; name: string; running: boolean; track: 'qa' | 'dev'; kind: string }
const KIND: Record<string, string> = { triage: 'Triage', test: 'Test', fix: 'Fix', regression: 'Regression' }

/** One tab per track (Test and Fix run side by side), then the list. */
export function sprintTabs(now: NowSprint[]) {
  return [
    ...now.map((n) => ({ key: n.id, href: sprintHref(n), label: `${KIND[n.kind] ?? 'Sprint'} · ${n.running ? n.name : `next ${n.name}`}` })),
    { key: 'all', href: '/sprints', label: 'All sprints' },
  ]
}

/**
 * Tabs for the sprints that matter now: whatever is running, plus the next test and fix sprints
 * when none of that type is running yet (so the next T and F are always one click away).
 */
export function nowSprints<S extends { id: string; name: string; status: string; starts_on: string; kind: string }>(sprints: S[], running: S[]): NowSprint[] {
  return (['triage', 'test', 'fix', 'regression'] as const).flatMap((kind): NowSprint[] => {
    const track = kind === 'fix' ? 'dev' : 'qa'
    const cur = running.find((s) => s.kind === kind)
    if (cur) return [{ id: cur.id, name: cur.name, running: true, track, kind }]
    if (kind !== 'test' && kind !== 'fix') return []
    const next = sprints.find((s) => s.kind === kind && s.status === 'planned')
    return next ? [{ id: next.id, name: next.name, running: false, track, kind }] : []
  })
}
