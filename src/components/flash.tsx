export function Flash({ error, ok }: { error?: string; ok?: string }) {
  if (!error && !ok) return null
  return (
    <div role="status"
      className={`mb-4 rounded-md px-3 py-2 text-sm ${error ? 'bg-[var(--crit-soft)] text-[var(--crit)]' : 'bg-[var(--good-soft)] text-[var(--good)]'}`}>
      {error ?? ok}
    </div>
  )
}
