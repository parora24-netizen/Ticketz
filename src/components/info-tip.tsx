'use client'

import { useRef, useState } from 'react'

/** A small "i" that shows a definition on hover, focus or tap. Fixed, so a scrolling table can't clip it. */
export function InfoTip({ text }: { text: string }) {
  const ref = useRef<HTMLButtonElement>(null)
  const [at, setAt] = useState<{ left: number; top: number } | null>(null)
  const show = () => {
    const r = ref.current?.getBoundingClientRect()
    if (r) setAt({ left: Math.max(8, Math.min(r.left - 110, window.innerWidth - 248)), top: r.bottom + 6 })
  }
  return (
    <>
      <button ref={ref} type="button" aria-label={text} onMouseEnter={show} onMouseLeave={() => setAt(null)} onFocus={show} onBlur={() => setAt(null)}
        onClick={(e) => { e.stopPropagation(); show() }}
        className="ml-1 inline-flex size-3.5 cursor-help items-center justify-center rounded-full border border-[var(--line)] align-[1px] font-serif text-[9.5px] leading-none text-[var(--muted)] normal-case italic hover:border-[var(--navy)] hover:text-[var(--navy)]">
        i
      </button>
      {at && (
        <span role="tooltip" style={{ left: at.left, top: at.top }}
          className="fixed z-50 w-60 border border-[var(--line)] bg-white px-2.5 py-2 text-left text-[12px] leading-snug font-normal tracking-normal whitespace-normal text-[var(--ink)] normal-case shadow-[0_18px_44px_rgba(9,17,38,.24)]">
          {text}
        </span>
      )}
    </>
  )
}
