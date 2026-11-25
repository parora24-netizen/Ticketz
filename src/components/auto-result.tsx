'use client'

import Link from '@/components/link'
import { ResultChip } from '@/components/ui'
import type { RunResult } from '@/lib/workflow/case-stage'

export type Waiting = { key: string; title: string; owner: string | null }

/** The words for an automated result, with a skip held up by an open ask as its own bucket. */
export const autoLabel = (r: string | null, waiting: Waiting[]) =>
  waiting.length ? 'Waiting on ask' : r === 'passed' ? 'Passed' : r === 'failed' ? 'Failed' : r === 'known_defect' ? 'Known defect' : r === 'skipped' ? 'Skipped' : r === 'blocked' ? 'Blocked' : 'Not run'

/**
 * An automated result in a grid cell. A skip held up by an open ask reads "Waiting · ASK-87" and
 * links to the ask, with its owner and question on hover; any other result shows its note on hover.
 */
export function AutoResult({ r, note, waiting }: { r: RunResult | null; note?: string | null; waiting: Waiting[] }) {
  if (waiting.length) {
    return (
      <span className="inline-flex flex-wrap gap-1">
        {waiting.map((a) => (
          <Link key={a.key} href={`/asks/${a.key}`} title={`Waiting on ${a.owner ?? 'nobody yet'}: ${a.title}`}
            className="chip border-[var(--warn-line)] bg-[var(--warn-soft)] text-[var(--warn)] hover:underline">Waiting · {a.key}</Link>
        ))}
      </span>
    )
  }
  return <span title={note ?? undefined}><ResultChip r={r} /></span>
}
