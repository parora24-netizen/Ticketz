'use client'

import { useState } from 'react'
import { toast } from '@/components/toast'
import { browserClient } from '@/lib/supabase/browser'
import { tooBig, tooMany, uploadErrorMessage } from '@/lib/upload-errors'

type Upload = { path: string; name: string; size: number; type: string | null; preview: string | null }

const MAX_FILES = 10
const MAX_BYTES = 10 * 1024 * 1024
const safeName = (n: string) => n.replace(/[^\w.-]+/g, '_').slice(-80) || 'file'

/**
 * Screenshots (or PDFs) uploaded straight to the private evidence bucket under `folder`, e.g.
 * `runs/<case id>`. Pick files, drop them on the box, or paste a screenshot with `onPaste`.
 * `opts` picks another bucket and size limit, as test case files do.
 */
export function useEvidence(folder: string, opts: { bucket?: string; maxBytes?: number; types?: string } = {}) {
  const bucket = opts.bucket ?? 'evidence'
  const maxBytes = opts.maxBytes ?? MAX_BYTES
  const types = opts.types ?? 'images or PDF'
  const [files, setFiles] = useState<Upload[]>([])
  const [uploading, setUploading] = useState(0)

  /** Uploads the files and returns those that made it. */
  async function add(list: FileList | File[]): Promise<Upload[]> {
    const all = [...list]
    const picked = all.slice(0, Math.max(0, MAX_FILES - files.length))
    if (picked.length < all.length) toast(tooMany(all.length, picked.length, MAX_FILES), 'error')
    const done: Upload[] = []
    if (!picked.length) return done
    const supabase = browserClient()
    setUploading((n) => n + picked.length)
    for (const f of picked) {
      if (f.size > maxBytes) { toast(tooBig(f.name, maxBytes), 'error'); setUploading((n) => n - 1); continue }
      const name = safeName(f.name || 'screenshot.png')
      const path = `${folder}/${crypto.randomUUID()}-${name}`
      const { error } = await supabase.storage.from(bucket).upload(path, f, { contentType: f.type || 'application/octet-stream' })
      setUploading((n) => n - 1)
      if (error) { toast(uploadErrorMessage(f.name || name, error.message, maxBytes, types), 'error'); continue }
      const up = { path, name, size: f.size, type: f.type || null, preview: f.type.startsWith('image/') ? URL.createObjectURL(f) : null }
      done.push(up)
      setFiles((fs) => [...fs, up])
    }
    return done
  }

  return {
    files,
    uploading,
    paths: files.map((f) => f.path),
    add,
    remove: (path: string) => setFiles((fs) => fs.filter((x) => x.path !== path)),
    reset: () => setFiles([]),
    /** For a form's onPaste: a pasted screenshot is attached. */
    onPaste: (e: React.ClipboardEvent) => {
      const imgs = filesIn(e.clipboardData).filter((f) => f.type.startsWith('image/'))
      if (imgs.length) { e.preventDefault(); void add(imgs) }
    },
  }
}

/**
 * The files in a drop or paste. Some apps hand a screenshot over as an item rather than in
 * `files`, so both are read.
 */
export function filesIn(dt: DataTransfer | null): File[] {
  if (!dt) return []
  const files = [...dt.files]
  if (files.length) return files
  return [...dt.items].filter((i) => i.kind === 'file').map((i) => i.getAsFile()).filter((f): f is File => !!f)
}

export function EvidenceField({ ev, label = 'Screenshots (optional)', accept = 'image/png,image/jpeg,image/gif,image/webp,application/pdf', hint = 'Images or PDF, up to 10 MB each', prompt = 'drop them here, or paste a screenshot' }: {
  ev: Pick<ReturnType<typeof useEvidence>, 'add' | 'files' | 'uploading' | 'remove'>; label?: string; accept?: string; hint?: string; prompt?: string
}) {
  return (
    <div>
      <span className="label">{label}</span>
      <label onDragOver={(e) => e.preventDefault()} onDrop={(e) => {
        e.preventDefault()
        const dropped = filesIn(e.dataTransfer)
        if (dropped.length) void ev.add(dropped)
        else toast('Nothing to attach in that drop. Save the image as a file and drop that, or copy it and press Ctrl+V.', 'error')
      }}
        className="mt-1 flex cursor-pointer flex-col items-center gap-1 border border-dashed border-[var(--line)] bg-[var(--surface-3)] px-3 py-3 text-center text-[12px] text-[var(--muted)] hover:border-[var(--navy)]">
        <input type="file" multiple accept={accept} className="sr-only"
          onChange={(e) => { if (e.target.files) void ev.add(e.target.files); e.target.value = '' }} />
        <span><b className="text-[var(--accent)]">Choose files</b>, {prompt}</span>
        <span className="text-[11px]">{hint}</span>
      </label>
      {(ev.files.length > 0 || ev.uploading > 0) && (
        <ul className="mt-2 flex flex-wrap gap-2">
          {ev.files.map((f) => (
            <li key={f.path} className="relative border border-[var(--line)] bg-white">
              {f.preview
                // eslint-disable-next-line @next/next/no-img-element -- a local preview of the file being attached
                ? <img src={f.preview} alt={f.name} className="h-16 w-24 object-cover" />
                : <span className="flex h-16 w-24 items-center justify-center px-1 text-center text-[10.5px] text-[var(--muted)]">{f.name}</span>}
              <button type="button" aria-label={`Remove ${f.name}`} onClick={() => ev.remove(f.path)}
                className="absolute top-0 right-0 bg-white/90 px-1 text-[11px] text-[var(--muted)] hover:text-[var(--crit)]">✕</button>
            </li>
          ))}
          {ev.uploading > 0 && <li className="flex h-16 w-24 items-center justify-center border border-dashed border-[var(--line)] text-[11px] text-[var(--muted)]">Uploading…</li>}
        </ul>
      )}
    </div>
  )
}
