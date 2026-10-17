import Image from 'next/image'
import Link from 'next/link'
import { SubmitButton } from '@/components/submit-button'
import { sendCode, setPasswordWithCode, signInWithPassword } from './actions'

const ERRORS: Record<string, string> = {
  credentials: 'That email and password do not match. First time here? Set a password below.',
  domain: 'Use your @vulqan.ai or @mezocliq.com email.',
  send: 'The code could not be sent. Try again in a minute.',
  rate: 'Too many emails were sent just now. Wait a few minutes and try again.',
  code: 'That code is wrong or has expired. Ask for a new one.',
  short: 'Use at least 8 characters for the password.',
  mismatch: 'The two passwords do not match.',
  weak: 'Choose a stronger password.',
  save: 'The password could not be saved. Try again.',
  link: 'That sign-in link has expired or was opened in another browser. Sign in with your password, or set one below.',
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { error, sent, next, mode, email } = await searchParams
  const nextValue = next ?? '/'
  const codeMode = mode === 'code'
  return (
    <main className="grid min-h-screen bg-white md:grid-cols-2">
      <div className="relative hidden flex-col justify-end bg-[#0f1b33] p-8 md:flex"
        style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,.08) 1px, transparent 1px)', backgroundSize: '16px 16px' }}>
        <p className="mono text-[11px] tracking-[0.1em] text-white/50 uppercase">Release 26.111 · tracker</p>
      </div>
      <div className="flex items-center justify-center px-6">
        <div className="w-full max-w-sm">
          <Image src="/vulqan-logo.png" alt="Vulqan" width={30} height={40} priority />

          {!codeMode && (
            <>
              <h1 className="mt-5 text-[26px] font-semibold text-[var(--navy-ink)]">Sign in</h1>
              <p className="mt-1 text-[13px] text-[var(--muted)]">Sprints, test results and tickets for the 26.111 release.</p>
              <form action={signInWithPassword} className="mt-6 space-y-3">
                <input type="hidden" name="next" value={nextValue} />
                <label className="block"><span className="label">Work email</span>
                  <input name="email" type="email" required autoComplete="username" defaultValue={email} className="input mt-1 w-full" placeholder="you@vulqan.ai" />
                </label>
                <label className="block"><span className="label">Password</span>
                  <input name="password" type="password" required autoComplete="current-password" className="input mt-1 w-full" />
                </label>
                {error && <p className="text-[12.5px] text-[var(--crit)]">{ERRORS[error] ?? 'Something went wrong.'}</p>}
                <SubmitButton primary className="w-full" pendingText="Signing in…">Sign in</SubmitButton>
              </form>
              <p className="mt-5 text-[12.5px] text-[var(--muted)]">
                First time here, or forgot your password?{' '}
                <Link href={`/login?mode=code&next=${encodeURIComponent(nextValue)}`} className="font-semibold text-[var(--accent)] hover:underline">Set a password</Link>
              </p>
            </>
          )}

          {codeMode && !sent && (
            <>
              <h1 className="mt-5 text-[26px] font-semibold text-[var(--navy-ink)]">Set a password</h1>
              <p className="mt-1 text-[13px] text-[var(--muted)]">We email you a 6-digit code. Enter it here with your new password.</p>
              <form action={sendCode} className="mt-6 space-y-3">
                <input type="hidden" name="next" value={nextValue} />
                <label className="block"><span className="label">Work email</span>
                  <input name="email" type="email" required autoComplete="email" defaultValue={email} className="input mt-1 w-full" placeholder="you@vulqan.ai" />
                </label>
                {error && <p className="text-[12.5px] text-[var(--crit)]">{ERRORS[error] ?? 'Something went wrong.'}</p>}
                <SubmitButton primary className="w-full" pendingText="Sending…">Email me a code</SubmitButton>
              </form>
              <p className="mt-5 text-[12.5px]"><Link href="/login" className="text-[var(--accent)] hover:underline">Back to sign in</Link></p>
            </>
          )}

          {codeMode && sent && (
            <>
              <h1 className="mt-5 text-[26px] font-semibold text-[var(--navy-ink)]">Check your email</h1>
              <p className="mt-1 text-[13px] text-[var(--muted)]">We sent a code to <strong className="text-[var(--ink)]">{sent}</strong>. It expires in an hour.</p>
              <form action={setPasswordWithCode} className="mt-6 space-y-3">
                <input type="hidden" name="next" value={nextValue} />
                <input type="hidden" name="email" value={sent} />
                <label className="block"><span className="label">Code from the email</span>
                  <input name="code" required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,12}" className="input mono mt-1 w-full text-[16px] tracking-[0.3em]" placeholder="123456" />
                </label>
                <label className="block"><span className="label">New password</span>
                  <input name="password" type="password" required minLength={8} autoComplete="new-password" className="input mt-1 w-full" />
                </label>
                <label className="block"><span className="label">Same password again</span>
                  <input name="confirm" type="password" required minLength={8} autoComplete="new-password" className="input mt-1 w-full" />
                </label>
                {error && <p className="text-[12.5px] text-[var(--crit)]">{ERRORS[error] ?? 'Something went wrong.'}</p>}
                <SubmitButton primary className="w-full" pendingText="Saving…">Save password and sign in</SubmitButton>
              </form>
              <p className="mt-5 text-[12.5px] text-[var(--muted)]">
                No email? <Link href={`/login?mode=code&next=${encodeURIComponent(nextValue)}`} className="text-[var(--accent)] hover:underline">Send another code</Link>
              </p>
            </>
          )}
        </div>
      </div>
    </main>
  )
}
