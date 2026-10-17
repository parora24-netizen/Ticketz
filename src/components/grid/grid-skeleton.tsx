/** What a grid page looks like while it loads: toolbar, header row and faint rows. */
export function GridSkeleton({ rows = 14 }: { rows?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading" className="animate-pulse">
      <div className="mb-4 flex items-center justify-between"><div className="h-4 w-80 bg-[var(--line-soft)]" /><div className="h-8 w-28 bg-[var(--line-soft)]" /></div>
      <div className="mb-3 flex gap-2"><div className="h-8 w-64 bg-[var(--line-soft)]" /><div className="ml-auto h-8 w-20 bg-[var(--line-soft)]" /></div>
      <div className="border border-[var(--line)] bg-white">
        <div className="h-[34px] border-b border-[var(--line)] bg-[var(--surface-2)]" />
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className="flex h-9 items-center gap-6 border-b border-[var(--row)] px-3">
            <div className="h-3 w-24 bg-[var(--line-soft)]" /><div className="h-3 flex-1 bg-[var(--surface-2)]" /><div className="h-3 w-20 bg-[var(--line-soft)]" />
          </div>
        ))}
      </div>
    </div>
  )
}
