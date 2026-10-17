'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'
import { SubmitButton } from '@/components/submit-button'
import { commitImport, previewImport, type ImportState } from './actions'

const STATUS_TONE = {
  new: 'border-[var(--good-line)] bg-[var(--good-soft)] text-[var(--good)]',
  updated: 'border-[var(--accent-line)] bg-[var(--accent-soft)] text-[var(--accent)]',
  unchanged: 'border-[var(--line-soft)] bg-[var(--surface-2)] text-[var(--muted)]',
}

export function ImportForm() {
  const [preview, previewAction] = useActionState<ImportState, FormData>(previewImport, {})
  const [result, commitAction] = useActionState<ImportState, FormData>(commitImport, {})
  const [show, setShow] = useState<'changes' | 'all'>('changes')

  if (result.done) {
    return (
      <div className="card p-6">
        <h2 className="text-[17px] font-semibold">Import saved</h2>
        <p className="mt-2 text-[13px] text-[var(--ink-2)]">
          {result.done.added} new test cases added, {result.done.updated} updated. Automation status and results were kept.
        </p>
        <div className="mt-4 flex gap-2">
          <Link href="/cases" className="btn btn-primary">Open test cases</Link>
          {result.done.firstNewId && <Link href={`/cases/${result.done.firstNewId}`} className="btn">First new case</Link>}
          <a href="/cases/import" className="btn">Import more</a>
        </div>
      </div>
    )
  }

  const rows = (preview.rows ?? []).filter((r) => show === 'all' || r.status !== 'unchanged')
  return (
    <div className="space-y-5">
      <form action={previewAction} className="card grid gap-5 p-5 lg:grid-cols-2">
        <div>
          <h2 className="text-[15px] font-semibold">Upload a file</h2>
          <p className="mt-1 text-[12.5px] text-[var(--muted)]">The test workbook (.xlsx) or a CSV with the same column headers.</p>
          <input type="file" name="file" accept=".xlsx,.csv" className="mt-3 block w-full text-[12.5px] file:mr-3 file:h-8 file:border file:border-[var(--line)] file:bg-white file:px-3 file:font-semibold file:text-[var(--ink-2)]" />
        </div>
        <div>
          <h2 className="text-[15px] font-semibold">Or paste from Excel</h2>
          <p className="mt-1 text-[12.5px] text-[var(--muted)]">Copy the header row and the rows below it, then paste here.</p>
          <textarea name="pasted" rows={4} className="input mono mt-3 w-full text-[11.5px]" placeholder={'Zone\tPage\tTest Case Title\tPriority\tTest Steps\tExpected Result'} />
        </div>
        <div className="flex items-center gap-3 lg:col-span-2">
          <SubmitButton primary pendingText="Reading…">Preview import</SubmitButton>
          <span className="text-[12px] text-[var(--muted)]">
            Needed columns: Zone, Page, Test Case Title, Priority. Optional: Test Case ID (blank = next free id), Pre-Conditions, Test Steps, Test Data, Expected Result, Test Type.
          </span>
        </div>
        {preview.error && <p className="text-[12.5px] text-[var(--crit)] lg:col-span-2">{preview.error}</p>}
      </form>

      {preview.counts && (
        <section className="card">
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-[var(--line)] px-4 py-3">
            <div>
              <div className="label">Preview · {preview.source}</div>
              <div className="mt-1 text-[13px]">
                <b className="text-[var(--good)]">{preview.counts.new} new</b> · <b className="text-[var(--accent)]">{preview.counts.updated} changed</b> ·{' '}
                {preview.counts.unchanged} unchanged{preview.errors?.length ? <> · <b className="text-[var(--crit)]">{preview.errors.length} rows skipped</b></> : null}
              </div>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <select className="select" value={show} onChange={(e) => setShow(e.target.value as 'changes' | 'all')}>
                <option value="changes">Show changes</option>
                <option value="all">Show all rows</option>
              </select>
              <form action={commitAction}>
                <input type="hidden" name="payload" value={preview.payload} />
                <SubmitButton primary pendingText="Saving…" disabled={!preview.counts.new && !preview.counts.updated}>
                  Save {preview.counts.new + preview.counts.updated} {preview.counts.new + preview.counts.updated === 1 ? 'case' : 'cases'}
                </SubmitButton>
              </form>
            </div>
          </div>
          {result.error && <p className="px-4 pt-3 text-[12.5px] text-[var(--crit)]">{result.error}</p>}
          {!!preview.errors?.length && (
            <div className="border-b border-[var(--line)] bg-[var(--crit-soft)] px-4 py-3 text-[12.5px] text-[var(--crit)]">
              <div className="font-semibold">Skipped rows (fix them in the file and preview again)</div>
              <ul className="mt-1 max-h-40 list-disc overflow-auto pl-5">
                {preview.errors.map((e) => <li key={e.row}>Row {e.row}: {e.message}</li>)}
              </ul>
            </div>
          )}
          <div className="max-h-[60vh] overflow-auto">
            <table className="table">
              <thead className="sticky top-0"><tr><th>Row</th><th>ID</th><th>Title</th><th>Area</th><th>Priority</th><th>Change</th></tr></thead>
              <tbody>
                {rows.slice(0, 1000).map((r, i) => (
                  <tr key={`${r.tc_id}-${i}`}>
                    <td className="mono text-[11.5px] text-[var(--faint)]">{r.row ?? ''}</td>
                    <td className="mono text-[12px]">{r.tc_id ?? <span className="text-[var(--faint)]">next id</span>}</td>
                    <td>{r.title}</td>
                    <td className="whitespace-nowrap text-[12px]">{r.area}</td>
                    <td>{r.priority}</td>
                    <td>
                      <span className={`chip ${STATUS_TONE[r.status]}`}>{r.status === 'new' ? 'New' : r.status === 'updated' ? 'Changed' : 'Same'}</span>
                      {r.changed.length > 0 && <span className="ml-1.5 text-[11.5px] text-[var(--muted)]">{r.changed.join(', ').replaceAll('_', ' ')}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 && <p className="p-6 text-center text-[13px] text-[var(--muted)]">Nothing would change.</p>}
          </div>
        </section>
      )}
    </div>
  )
}
