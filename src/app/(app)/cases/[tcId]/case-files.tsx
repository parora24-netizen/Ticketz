'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { EvidenceField, useEvidence } from '@/components/evidence'
import { toast } from '@/components/toast'
import { CASE_FILES_BUCKET, CASE_FILE_ACCEPT, MAX_CASE_FILE_BYTES, caseFileFolder, fileSize } from '@/lib/case-files'
import { addCaseFiles, removeCaseFile } from './file-actions'

export type CaseFile = { id: string; name: string; size: number; url: string | null; by: string | null; at: string; canRemove: boolean }

/** A test case's files: datasets and inputs a test needs, or screenshots. Anyone on the team can add them. */
export function CaseFiles({ caseId, files, canAdd }: { caseId: string; files: CaseFile[]; canAdd: boolean }) {
  const router = useRouter()
  const ev = useEvidence(caseFileFolder(caseId), { bucket: CASE_FILES_BUCKET, maxBytes: MAX_CASE_FILE_BYTES })
  const [pending, start] = useTransition()
  const [removing, setRemoving] = useState<string | null>(null)

  // Upload, then record them on the case straight away, so nothing waits on a second click.
  async function add(list: FileList | File[]) {
    const up = await ev.add(list)
    if (!up.length) return up
    const res = await addCaseFiles({ case_id: caseId, files: up.map((f) => ({ path: f.path, name: f.name, size: f.size, type: f.type })) })
    if (res.error) toast(res.error, 'error')
    else { toast(`${up.length} file${up.length === 1 ? '' : 's'} added`); ev.reset(); start(() => router.refresh()) }
    return up
  }

  function remove(f: CaseFile) {
    if (!window.confirm(`Remove ${f.name} from this case? This cannot be undone.`)) return
    setRemoving(f.id)
    start(async () => {
      const res = await removeCaseFile(f.id)
      setRemoving(null)
      if (res.error) toast(res.error, 'error')
      else { toast(`${f.name} removed`); router.refresh() }
    })
  }

  return (
    <section className="card">
      <h3 className="border-b border-[var(--line)] px-4 py-2.5 text-[14px] font-semibold">Files{files.length ? <span className="ml-1.5 text-[12px] font-normal text-[var(--muted)]">{files.length}</span> : null}</h3>
      {files.length > 0 && (
        <ul className="divide-y divide-[var(--row)] text-[12.5px]">
          {files.map((f) => (
            <li key={f.id} className="flex items-start gap-2 px-4 py-2">
              <div className="min-w-0 flex-1">
                {f.url
                  ? <a href={f.url} className="font-medium break-all text-[var(--accent)] hover:underline">{f.name}</a>
                  : <span className="font-medium break-all">{f.name}</span>}
                <p className="text-[11.5px] text-[var(--muted)]">{fileSize(f.size)}{f.by ? ` · ${f.by}` : ''} · {new Date(f.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })}</p>
              </div>
              {f.canRemove && (
                <button type="button" onClick={() => remove(f)} disabled={pending} aria-label={`Remove ${f.name}`}
                  className="text-[11.5px] text-[var(--muted)] hover:text-[var(--crit)]">{removing === f.id ? 'Removing…' : 'Remove'}</button>
              )}
            </li>
          ))}
        </ul>
      )}
      {canAdd ? (
        <div className="px-4 py-3">
          <EvidenceField ev={{ ...ev, add }} label={files.length ? 'Add more' : 'Datasets, inputs or screenshots this test needs'} accept={CASE_FILE_ACCEPT}
            prompt="or drop them here" hint="Zip, CSV, Excel, JSON, text, PDF or images, up to 50 MB each" />
        </div>
      ) : !files.length && <p className="px-4 py-3 text-[12.5px] text-[var(--muted)]">No files.</p>}
    </section>
  )
}
