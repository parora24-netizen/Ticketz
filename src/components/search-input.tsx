'use client'

/** A search box with a × to empty it. Searches are not remembered: each visit starts with an empty box. */
export function SearchInput({ value, onChange, placeholder, label, className = 'w-56' }: {
  value: string; onChange: (v: string) => void; placeholder: string; label: string; className?: string
}) {
  return (
    <span className={`relative inline-flex ${className}`}>
      <input value={value} onChange={(e) => onChange(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape' && value) onChange('') }}
        placeholder={placeholder} aria-label={label} className="input w-full pr-7" />
      {value && (
        <button type="button" onClick={() => onChange('')} aria-label="Clear search" title="Clear search"
          className="absolute top-1/2 right-1 flex h-6 w-6 -translate-y-1/2 items-center justify-center text-[15px] leading-none text-[var(--muted)] hover:text-[var(--ink)]">×</button>
      )}
    </span>
  )
}
