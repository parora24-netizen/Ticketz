/**
 * Reads a ticket key or test case id typed loosely into search ("dev 648", "dev648", "mm-99",
 * "tc 491", "TC-491") as the real one (DEV-648, MM-99, TC_491). Anything else comes back as typed.
 */
export function idFromSearch(q: string): string {
  const m = /^\s*(dev|mm|task|tc)\s*[-_\s]?\s*(\d+)\s*$/i.exec(q)
  if (!m) return q.trim().toUpperCase()
  const prefix = m[1].toUpperCase()
  const n = String(Number(m[2]))
  return prefix === 'TC' ? `TC_${n}` : `${prefix}-${n}`
}
