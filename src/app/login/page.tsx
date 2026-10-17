import { sendSignInLink } from './actions'

const ERRORS: Record<string, string> = {
  domain: 'Use your @vulqan.ai or @mezocliq.com email.',
  send: 'The sign-in link could not be sent. Try again in a minute.',
  link: 'That sign-in link has expired or was already used. Ask for a new one.',
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { error, sent, next } = await searchParams
  return (
    <main className="min-h-screen grid place-items-center bg-[var(--bg)] px-4">
      <div className="w-full max-w-sm rounded-xl border border-[var(--line)] bg-[var(--surface)] p-8">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">Vulqan 26.111</p>
        <h1 className="mt-1 text-2xl font-semibold">Release tracker</h1>
        {sent ? (
          <p className="mt-6 text-sm">
            Check <strong>{sent}</strong> for a sign-in link. It works once and expires in an hour.
          </p>
        ) : (
          <form action={sendSignInLink} className="mt-6 space-y-3">
            <input type="hidden" name="next" value={next ?? '/'} />
            <label className="block text-sm font-medium" htmlFor="email">Work email</label>
            <input id="email" name="email" type="email" required autoComplete="email" className="input w-full" placeholder="you@vulqan.ai" />
            {error && <p className="text-sm text-[var(--crit)]">{ERRORS[error] ?? 'Something went wrong.'}</p>}
            <button className="btn btn-primary w-full">Email me a sign-in link</button>
          </form>
        )}
      </div>
    </main>
  )
}
