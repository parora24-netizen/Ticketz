'use client'

import { useLinkStatus } from 'next/link'

/** A tab's label that shows, the moment it is clicked, that its view is on the way. */
export function TabLabel({ label }: { label: string }) {
  const { pending } = useLinkStatus()
  return (
    <span className="inline-flex items-center gap-1.5">
      {label}
      {pending && <span aria-label="Loading" className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-[var(--line)] border-t-[var(--navy)]" />}
    </span>
  )
}
