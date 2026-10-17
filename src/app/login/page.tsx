import Image from 'next/image'
import { SubmitButton } from '@/components/submit-button'
import { sendSignInLink } from './actions'

const ERRORS: Record<string, string> = {
  domain: 'Use your @vulqan.ai or @mezocliq.com email.',
  send: 'The sign-in link could not be sent. Try again in a minute.',
  link: 'That sign-in link has expired or was already used. Ask for a new one.',
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { error, sent, next } = await searchParams
  return (
    <main className="grid min-h-screen bg-white md:grid-cols-2">
      <div className="relative hidden flex-col justify-end bg-[#0f1b33] p-8 md:flex"
        style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,.08) 1px, transparent 1px)', backgroundSize: '16px 16px' }}>
        <p className="mono text-[11px] tracking-[0.1em] text-white/50 uppercase">Release 26.111 · tracker</p>
      </div>
      <div className="flex items-center justify-center px-6">
        <div className="w-full max-w-sm">
          <Image src="/vulqan-logo.png" alt="Vulqan" width={30} height={40} priority />
          <h1 className="mt-5 text-[26px] font-semibold text-[var(--navy-ink)]">Sign in</h1>
          <p className="mt-1 text-[13px] text-[var(--muted)]">Sprints, test results and tickets for the 26.111 release.</p>
          {sent ? (
            <p className="mt-6 border border-[var(--accent-line)] bg-[var(--accent-soft)] p-3 text-[13px]">
              Check <strong>{sent}</strong> for a sign-in link. It works once and expires in an hour.
            </p>
          ) : (
            <form action={sendSignInLink} className="mt-6 space-y-3">
              <input type="hidden" name="next" value={next ?? '/'} />
              <label className="label block" htmlFor="email">Work email</label>
              <input id="email" name="email" type="email" required autoComplete="email" className="input w-full" placeholder="you@vulqan.ai" />
              {error && <p className="text-[12.5px] text-[var(--crit)]">{ERRORS[error] ?? 'Something went wrong.'}</p>}
              <SubmitButton primary className="w-full" pendingText="Sending…">Email me a sign-in link</SubmitButton>
            </form>
          )}
        </div>
      </div>
    </main>
  )
}
