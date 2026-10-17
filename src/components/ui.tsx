import Link from 'next/link'
import type { Priority, RunResult } from '@/lib/workflow/case-stage'
import { STATE_LABEL, type TicketState } from '@/lib/workflow/ticket-machine'

type Tone = 'good' | 'warn' | 'crit' | 'accent' | 'muted'

const TONE: Record<Tone, string> = {
  good: 'bg-[var(--good-soft)] text-[var(--good)] border-[var(--good-line)]',
  warn: 'bg-[var(--warn-soft)] text-[var(--warn)] border-[var(--warn-line)]',
  crit: 'bg-[var(--crit-soft)] text-[var(--crit)] border-[var(--crit-line)]',
  accent: 'bg-[var(--accent-soft)] text-[var(--accent)] border-[var(--accent-line)]',
  muted: 'bg-[var(--surface-2)] text-[var(--muted)] border-[var(--line-soft)]',
}

export function Chip({ tone = 'muted', children }: { tone?: Tone; children: React.ReactNode }) {
  return <span className={`chip ${TONE[tone]}`}>{children}</span>
}

const PRIORITY_TONE: Record<Priority, Tone> = { Critical: 'crit', High: 'warn', Medium: 'accent', Low: 'muted' }
export function PriorityChip({ p }: { p: Priority }) {
  return <Chip tone={PRIORITY_TONE[p]}>{p}</Chip>
}

const RESULT_TONE: Record<RunResult, Tone> = {
  passed: 'good',
  failed: 'crit',
  known_defect: 'warn',
  skipped: 'muted',
  blocked: 'warn',
}
const RESULT_LABEL: Record<RunResult, string> = {
  passed: 'Passed',
  failed: 'Failed',
  known_defect: 'Known defect',
  skipped: 'Skipped',
  blocked: 'Blocked',
}
export function ResultChip({ r }: { r: RunResult | null }) {
  if (!r) return <span className="text-[var(--muted)]">—</span>
  return <Chip tone={RESULT_TONE[r]}>{RESULT_LABEL[r]}</Chip>
}

const STATE_TONE: Record<TicketState, Tone> = {
  new: 'crit',
  triaged: 'warn',
  in_fix: 'accent',
  ready_for_retest: 'accent',
  reopened: 'crit',
  closed: 'good',
  deferred: 'muted',
  duplicate: 'muted',
}
export function StateChip({ s }: { s: TicketState }) {
  return <Chip tone={STATE_TONE[s]}>{STATE_LABEL[s]}</Chip>
}

export function Stat({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: string; tone?: Tone }) {
  const color = tone ? TEXT[tone] : ''
  return (
    <div className="card px-4 py-3">
      <div className="label">{label}</div>
      <div className={`heading mt-1.5 text-[26px] leading-none font-semibold tabular-nums ${color || 'text-[var(--navy-ink)]'}`}>{value}</div>
      {sub && <div className="mono mt-1.5 text-[10.5px] text-[var(--faint)]">{sub}</div>}
    </div>
  )
}

export function PageHeader({ title, sub, children }: { title: string; sub?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-[22px] leading-tight font-semibold text-[var(--navy-ink)]">{title}</h1>
        {sub && <p className="mt-1 text-[13px] text-[var(--muted)]">{sub}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  )
}

const BAR: Record<Tone, string> = {
  good: 'bg-[var(--good)]',
  warn: 'bg-[var(--warn)]',
  crit: 'bg-[var(--crit)]',
  accent: 'bg-[var(--accent)]',
  muted: 'bg-[var(--line)]',
}
const TEXT: Record<Tone, string> = {
  good: 'text-[var(--good)]',
  warn: 'text-[var(--warn)]',
  crit: 'text-[var(--crit)]',
  accent: 'text-[var(--accent)]',
  muted: 'text-[var(--muted)]',
}

export function Bar({ parts }: { parts: { value: number; tone: Tone; label: string }[] }) {
  const total = parts.reduce((s, p) => s + p.value, 0) || 1
  return (
    <div className="flex h-1.5 w-full overflow-hidden bg-[var(--surface-2)]" role="img"
      aria-label={parts.map((p) => `${p.label} ${p.value}`).join(', ')}>
      {parts.map((p) =>
        p.value ? (
          <div key={p.label} title={`${p.label}: ${p.value}`} style={{ width: `${(p.value / total) * 100}%` }}
            className={BAR[p.tone]} />
        ) : null,
      )}
    </div>
  )
}

export function CaseLink({ tcId }: { tcId: string }) {
  return (
    <Link href={`/cases/${tcId}`} className="mono text-[12px] font-medium text-[var(--accent)] hover:underline">
      {tcId}
    </Link>
  )
}

export function TicketLink({ k }: { k: string }) {
  return (
    <Link href={`/tickets/${encodeURIComponent(k)}`} className="mono text-[12px] font-medium text-[var(--accent)] hover:underline">
      {k}
    </Link>
  )
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="px-3 py-6 text-center text-sm text-[var(--muted)]">{children}</p>
}
