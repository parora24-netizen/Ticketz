/**
 * Reads a ticket key, test case id or ask typed loosely into search ("dev 648", "dev648", "mm-99",
 * "tc 491", "TC-491", "ask 90") as the real one (DEV-648, MM-99, TC_491, ASK-90). Anything else comes back as typed.
 */
export function idFromSearch(q: string): string {
  const m = /^\s*(dev|mm|task|tc|ask)\s*[-_\s]?\s*(\d+)\s*$/i.exec(q)
  if (!m) return q.trim().toUpperCase()
  const prefix = m[1].toUpperCase()
  const n = String(Number(m[2]))
  return prefix === 'TC' ? `TC_${n}` : `${prefix}-${n}`
}
