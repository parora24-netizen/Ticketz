/** Shown the moment a link is clicked, while the next page loads. */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Loading" className="animate-pulse">
      <div className="h-3 w-28 bg-[var(--line-soft)]" />
      <div className="mt-3 h-6 w-64 bg-[var(--line-soft)]" />
      <div className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => <div key={i} className="card h-20" />)}
      </div>
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="card h-80" />
        <div className="card h-80" />
      </div>
    </div>
  )
}
