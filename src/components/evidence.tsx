'use client'

import { useState } from 'react'
import { toast } from '@/components/toast'
import { browserClient } from '@/lib/supabase/browser'

type Upload = { path: string; name: string; size: number; type: string | null; preview: string | null }

const MAX_FILES = 10
const MAX_BYTES = 10 * 1024 * 1024
const safeName = (n: string) => n.replace(/[^\w.-]+/g, '_').slice(-80) || 'file'

/**
 * Screenshots (or PDFs) uploaded straight to the private evidence bucket under `folder`, e.g.
 * `runs/<case id>`. Pick files, drop them on the box, or paste a screenshot with `onPaste`.
 * `opts` picks another bucket and size limit, as test case files do.
 */
export function useEvidence(folder: string, opts: { bucket?: string; maxBytes?: number } = {}) {
  const bucket = opts.bucket ?? 'evidence'
  const maxBytes = opts.maxBytes ?? MAX_BYTES
  const [files, setFiles] = useState<Upload[]>([])
  const [uploading, setUploading] = useState(0)

  /** Uploads the files and returns those that made it. */
  async function add(list: FileList | File[]): Promise<Upload[]> {
    const picked = [...list].slice(0, MAX_FILES - files.length)
    const done: Upload[] = []
    if (!picked.length) return done
    const supabase = browserClient()
    setUploading((n) => n + picked.length)
    for (const f of picked) {
      if (f.size > maxBytes) { toast(`${f.name} is over ${Math.round(maxBytes / 1024 / 1024)} MB`, 'error'); setUploading((n) => n - 1); continue }
      const name = safeName(f.name || 'screenshot.png')
      const path = `${folder}/${crypto.randomUUID()}-${name}`
      const { error } = await supabase.storage.from(bucket).upload(path, f, { contentType: f.type || 'application/octet-stream' })
      setUploading((n) => n - 1)
      if (error) { toast(`${name}: ${error.message}`, 'error'); continue }
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
      const imgs = [...e.clipboardData.files].filter((f) => f.type.startsWith('image/'))
      if (imgs.length) { e.preventDefault(); void add(imgs) }
    },
  }
}

export function EvidenceField({ ev, label = 'Screenshots (optional)', accept = 'image/png,image/jpeg,image/gif,image/webp,application/pdf', hint = 'Images or PDF, up to 10 MB each', prompt = 'drop them here, or paste a screenshot' }: {
  ev: Pick<ReturnType<typeof useEvidence>, 'add' | 'files' | 'uploading' | 'remove'>; label?: string; accept?: string; hint?: string; prompt?: string
}) {
  return (
    <div>
      <span className="label">{label}</span>
      <label onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void ev.add(e.dataTransfer.files) }}
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
