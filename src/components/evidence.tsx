'use client'

import { useState } from 'react'
import { toast } from '@/components/toast'
import { browserClient } from '@/lib/supabase/browser'

type Upload = { path: string; name: string; preview: string | null }

const MAX_FILES = 10
const MAX_BYTES = 10 * 1024 * 1024
const safeName = (n: string) => n.replace(/[^\w.-]+/g, '_').slice(-80) || 'file'

/**
 * Screenshots (or PDFs) uploaded straight to the private evidence bucket under `folder`, e.g.
 * `runs/<case id>`. Pick files, drop them on the box, or paste a screenshot with `onPaste`.
 */
export function useEvidence(folder: string) {
  const [files, setFiles] = useState<Upload[]>([])
  const [uploading, setUploading] = useState(0)

  async function add(list: FileList | File[]) {
    const picked = [...list].slice(0, MAX_FILES - files.length)
    if (!picked.length) return
    const supabase = browserClient()
    setUploading((n) => n + picked.length)
    for (const f of picked) {
      if (f.size > MAX_BYTES) { toast(`${f.name} is over 10 MB`, 'error'); setUploading((n) => n - 1); continue }
      const name = safeName(f.name || 'screenshot.png')
      const path = `${folder}/${crypto.randomUUID()}-${name}`
      const { error } = await supabase.storage.from('evidence').upload(path, f, { contentType: f.type || undefined })
      setUploading((n) => n - 1)
      if (error) { toast(`${name}: ${error.message}`, 'error'); continue }
      setFiles((fs) => [...fs, { path, name, preview: f.type.startsWith('image/') ? URL.createObjectURL(f) : null }])
    }
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

export function EvidenceField({ ev, label = 'Screenshots (optional)' }: { ev: ReturnType<typeof useEvidence>; label?: string }) {
  return (
    <div>
      <span className="label">{label}</span>
      <label onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); void ev.add(e.dataTransfer.files) }}
        className="mt-1 flex cursor-pointer flex-col items-center gap-1 border border-dashed border-[var(--line)] bg-[var(--surface-3)] px-3 py-3 text-center text-[12px] text-[var(--muted)] hover:border-[var(--navy)]">
        <input type="file" multiple accept="image/png,image/jpeg,image/gif,image/webp,application/pdf" className="sr-only"
          onChange={(e) => { if (e.target.files) void ev.add(e.target.files); e.target.value = '' }} />
        <span><b className="text-[var(--accent)]">Choose files</b>, drop them here, or paste a screenshot</span>
        <span className="text-[11px]">Images or PDF, up to 10 MB each</span>
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
