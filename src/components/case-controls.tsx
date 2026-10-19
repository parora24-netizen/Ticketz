'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Dialog } from '@/components/dialog'
import { toast } from '@/components/toast'
import { recordCaseResult, updateCases } from '@/app/(app)/actions'
import { browserClient } from '@/lib/supabase/browser'

type Result = 'passed' | 'failed' | 'blocked'
type Upload = { path: string; name: string; preview: string | null }

const MAX_FILES = 10
const MAX_BYTES = 10 * 1024 * 1024
const safeName = (n: string) => n.replace(/[^\w.-]+/g, '_').slice(-80) || 'file'

/**
 * Pass, Fail or Blocked, each with an optional comment and screenshots: pick files, drop them on
 * the box, or paste a screenshot (Ctrl+V). Files go straight to the private evidence bucket and
 * are kept with the result. A Fail raises a ticket unless one is open.
 */
export function CaseResultActions({ caseId, size = 'md', onDone }: { caseId: string; size?: 'sm' | 'md'; onDone?: () => void }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [ask, setAsk] = useState<Result | null>(null)
  const [note, setNote] = useState('')
  const [build, setBuild] = useState('')
  const [raise, setRaise] = useState(true)
  const [files, setFiles] = useState<Upload[]>([])
  const [uploading, setUploading] = useState(0)

  function begin(result: Result) {
    setNote(''); setBuild(''); setRaise(true); setFiles([]); setAsk(result)
  }

  async function add(list: FileList | File[]) {
    const picked = [...list].slice(0, MAX_FILES - files.length)
    if (!picked.length) return
    const supabase = browserClient()
    setUploading((n) => n + picked.length)
    for (const f of picked) {
      if (f.size > MAX_BYTES) { toast(`${f.name} is over 10 MB`, 'error'); setUploading((n) => n - 1); continue }
      const name = safeName(f.name || 'screenshot.png')
      const path = `runs/${caseId}/${crypto.randomUUID()}-${name}`
      const { error } = await supabase.storage.from('evidence').upload(path, f, { contentType: f.type || undefined })
      setUploading((n) => n - 1)
      if (error) { toast(`${name}: ${error.message}`, 'error'); continue }
      setFiles((fs) => [...fs, { path, name, preview: f.type.startsWith('image/') ? URL.createObjectURL(f) : null }])
    }
  }

  function save(result: Result) {
    start(async () => {
      const res = await recordCaseResult({
        case_id: caseId, result, note: note.trim() || undefined, build: build.trim() || undefined,
        raise_ticket: result === 'failed' ? raise : undefined, attachments: files.map((f) => f.path),
      })
      if (res.error) toast(res.error, 'error')
      else {
        toast(result === 'passed' ? 'Pass recorded' : result === 'blocked' ? 'Blocked recorded' : res.ticketKey ? `Fail recorded · ticket ${res.ticketKey}` : 'Fail recorded')
        setAsk(null)
        router.refresh()
        onDone?.()
      }
    })
  }

  const cls = size === 'sm' ? 'btn btn-sm' : 'btn'
  const title = ask === 'passed' ? 'Record a pass' : ask === 'failed' ? 'Record a failure' : 'Record as blocked'
  return (
    <>
      <button type="button" disabled={pending} onClick={() => begin('passed')} className={`${cls} border-[var(--good-line)] text-[var(--good)] hover:border-[var(--good)] hover:text-[var(--good)]`}>✓ Pass</button>
      <button type="button" disabled={pending} onClick={() => begin('failed')} className={`${cls} border-[var(--crit-line)] text-[var(--crit)] hover:border-[var(--crit)] hover:text-[var(--crit)]`}>✕ Fail</button>
      <button type="button" disabled={pending} onClick={() => begin('blocked')} className={cls}>Blocked</button>
      <Dialog open={!!ask} onClose={() => setAsk(null)} title={title}>
        {ask && (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save(ask) }}
            onPaste={(e) => { const imgs = [...e.clipboardData.files].filter((f) => f.type.startsWith('image/')); if (imgs.length) { e.preventDefault(); void add(imgs) } }}>
            <label className="block"><span className="label">{ask === 'failed' ? 'What happened' : ask === 'blocked' ? 'What is blocking it' : 'Comment (optional)'}</span>
              <textarea autoFocus required={ask === 'blocked'} rows={3} value={note} onChange={(e) => setNote(e.target.value)} className="input mt-1 w-full" />
            </label>
            <div>
              <span className="label">Screenshots (optional)</span>
              <label onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void add(e.dataTransfer.files) }}
                className="mt-1 flex cursor-pointer flex-col items-center gap-1 border border-dashed border-[var(--line)] bg-[var(--surface-3)] px-3 py-3 text-center text-[12px] text-[var(--muted)] hover:border-[var(--navy)]">
                <input type="file" multiple accept="image/png,image/jpeg,image/gif,image/webp,application/pdf" className="sr-only"
                  onChange={(e) => { if (e.target.files) void add(e.target.files); e.target.value = '' }} />
                <span><b className="text-[var(--accent)]">Choose files</b>, drop them here, or paste a screenshot</span>
                <span className="text-[11px]">Images or PDF, up to 10 MB each</span>
              </label>
              {(files.length > 0 || uploading > 0) && (
                <ul className="mt-2 flex flex-wrap gap-2">
                  {files.map((f) => (
                    <li key={f.path} className="relative border border-[var(--line)] bg-white">
                      {f.preview
                        // eslint-disable-next-line @next/next/no-img-element -- a local preview of the file being attached
                        ? <img src={f.preview} alt={f.name} className="h-16 w-24 object-cover" />
                        : <span className="flex h-16 w-24 items-center justify-center px-1 text-center text-[10.5px] text-[var(--muted)]">{f.name}</span>}
                      <button type="button" aria-label={`Remove ${f.name}`} onClick={() => setFiles((fs) => fs.filter((x) => x.path !== f.path))}
                        className="absolute top-0 right-0 bg-white/90 px-1 text-[11px] text-[var(--muted)] hover:text-[var(--crit)]">✕</button>
                    </li>
                  ))}
                  {uploading > 0 && <li className="flex h-16 w-24 items-center justify-center border border-dashed border-[var(--line)] text-[11px] text-[var(--muted)]">Uploading…</li>}
                </ul>
              )}
            </div>
            {ask === 'failed' && (
              <>
                <label className="block"><span className="label">Build tested</span>
                  <input value={build} onChange={(e) => setBuild(e.target.value)} placeholder="Optional" className="input mono mt-1 w-full" />
                </label>
                <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={raise} onChange={(e) => setRaise(e.target.checked)} />Raise a ticket (skipped if one is already open)</label>
              </>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setAsk(null)} className="btn">Cancel</button>
              <button disabled={pending || uploading > 0} className="btn btn-primary">
                {uploading > 0 ? 'Uploading…' : pending ? 'Saving…' : ask === 'passed' ? 'Record pass' : ask === 'failed' ? 'Record fail' : 'Record blocked'}
              </button>
            </div>
          </form>
        )}
      </Dialog>
    </>
  )
}

/** Who tests the case, in the side panel: change and it saves. */
export function CaseTesterField({ caseId, value, people, disabled, onDone }: {
  caseId: string; value: string | null; people: { id: string; name: string }[]; disabled?: boolean; onDone?: () => void
}) {
  const router = useRouter()
  const [v, setV] = useState(value ?? '')
  const [pending, start] = useTransition()
  return (
    <select value={v} disabled={disabled || pending} aria-label="Tester" className="select w-full"
      onChange={(e) => {
        const next = e.target.value
        const before = v
        setV(next)
        start(async () => {
          const res = await updateCases([caseId], { tester_id: next || null })
          if (res.error) { setV(before); toast(res.error, 'error') }
          else { toast('Tester saved'); router.refresh(); onDone?.() }
        })
      }}>
      <option value="">No tester</option>
      {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
    </select>
  )
}

/** Automation status in the case's side panel: change and it saves. */
export function CaseAutomationField({ caseId, value, disabled, onDone }: { caseId: string; value: string; disabled?: boolean; onDone?: () => void }) {
  const router = useRouter()
  const [v, setV] = useState(value)
  const [pending, start] = useTransition()
  return (
    <select value={v} disabled={disabled || pending} aria-label="Automation" className="select w-full"
      onChange={(e) => {
        const next = e.target.value as 'not_automated' | 'automated' | 'manual_only'
        const before = v
        setV(next)
        start(async () => {
          const res = await updateCases([caseId], { automation: next })
          if (res.error) { setV(before); toast(res.error, 'error') }
          else { toast('Automation saved'); router.refresh(); onDone?.() }
        })
      }}>
      <option value="not_automated">Not automated yet</option>
      <option value="automated">Automated</option>
      <option value="manual_only">Manual only</option>
    </select>
  )
}
