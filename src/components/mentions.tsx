'use client'

import { useRef, useState } from 'react'

/**
 * A comment box where typing @ suggests team members; picking one writes "@Name". The database
 * turns each @Name into a notification for that person.
 */
export function MentionTextarea({ people, ...props }: { people: string[] } & React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const [query, setQuery] = useState<string | null>(null)
  const [pick, setPick] = useState(0)
  const matches = query === null ? [] : people.filter((p) => p.toLowerCase().startsWith(query.toLowerCase())).slice(0, 6)

  // The word being typed, if it starts with @.
  function update() {
    const el = ref.current
    if (!el) return
    const before = el.value.slice(0, el.selectionStart)
    const m = /(?:^|[^\w@])@(\w*)$/.exec(before)
    setQuery(m ? m[1] : null)
    setPick(0)
  }
  function choose(name: string) {
    const el = ref.current
    if (!el) return
    const at = el.selectionStart
    const before = el.value.slice(0, at).replace(/@\w*$/, `@${name} `)
    el.value = before + el.value.slice(at)
    el.setSelectionRange(before.length, before.length)
    el.focus()
    setQuery(null)
  }

  return (
    <div className="relative">
      <textarea ref={ref} {...props} onInput={update} onClick={update}
        onBlur={() => setTimeout(() => setQuery(null), 150)}
        onKeyDown={(e) => {
          if (!matches.length) return
          if (e.key === 'ArrowDown') { e.preventDefault(); setPick((i) => (i + 1) % matches.length) }
          else if (e.key === 'ArrowUp') { e.preventDefault(); setPick((i) => (i - 1 + matches.length) % matches.length) }
          else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); choose(matches[pick]) }
          else if (e.key === 'Escape') setQuery(null)
        }} />
      {matches.length > 0 && (
        <ul role="listbox" className="absolute left-2 z-30 mt-1 w-56 border border-[var(--line)] bg-white py-1 shadow-[0_18px_44px_rgba(9,17,38,.18)]">
          {matches.map((name, i) => (
            <li key={name} role="option" aria-selected={i === pick}>
              <button type="button" onMouseDown={(e) => { e.preventDefault(); choose(name) }}
                className={`block w-full px-3 py-1.5 text-left text-[13px] ${i === pick ? 'bg-[var(--accent-soft)] text-[var(--navy-ink)]' : 'hover:bg-[var(--surface-3)]'}`}>
                @{name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** A comment with each @Name of a team member highlighted. */
export function WithMentions({ text, people }: { text: string; people: string[] }) {
  if (!people.length) return <>{text}</>
  const esc = people.map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).sort((a, b) => b.length - a.length)
  const parts = text.split(new RegExp(`(@(?:${esc.join('|')})(?![\\w]))`, 'gi'))
  return <>{parts.map((p, i) => (i % 2 ? <b key={i} className="font-semibold text-[var(--accent)]">{p}</b> : p))}</>
}
