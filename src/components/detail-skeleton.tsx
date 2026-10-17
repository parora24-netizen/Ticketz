/** What a detail page (ticket, test case, sprint) looks like while it loads. */
export function DetailSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading" className="animate-pulse">
      <div className="h-6 w-2/3 max-w-xl bg-[var(--line-soft)]" />
      <div className="mt-2 h-3 w-64 bg-[var(--surface-2)]" />
      <div className="mt-4 flex gap-2">{[0, 1, 2].map((i) => <div key={i} className="h-8 w-24 bg-[var(--line-soft)]" />)}</div>
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="card h-96" />
        <div className="card h-72" />
      </div>
    </div>
  )
}
