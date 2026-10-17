export default function NoAccess() {
  return (
    <main className="min-h-screen grid place-items-center bg-[var(--bg)] px-4">
      <div className="max-w-sm rounded-[2px] border border-[var(--line)] bg-[var(--surface)] p-8">
        <h1 className="text-xl font-semibold">You are signed in, but not on the team list</h1>
        <p className="mt-3 text-sm text-[var(--muted)]">Ask the release lead to add your email under Admin, then reload this page.</p>
        <form action="/auth/signout" method="post" className="mt-6">
          <button className="btn">Sign out</button>
        </form>
      </div>
    </main>
  )
}
