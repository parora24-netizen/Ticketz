import Image from 'next/image'
import Link from 'next/link'
import { SubmitButton } from '@/components/submit-button'
import { serverEnv } from '@/lib/env'
import { sendCode, setPasswordWithCode, signInWithPassword } from './actions'

const ERRORS: Record<string, string> = {
  credentials: 'That email and password do not match. First time here? Set a password below.',
  domain: 'Use your @vulqan.ai or @mezocliq.com email.',
  send: 'The code could not be sent. Try again in a minute.',
  rate: 'Too many code emails were sent this hour. Ask the lead for a temporary password instead.',
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
  const domains = serverEnv().allowedDomains
  // Each answer from the server remounts the form, so React's reset after an action refills the
  // email from the address instead of emptying it.
  const formKey = `${error ?? ''}:${email ?? ''}`
  return (
    <main className="grid min-h-screen bg-white md:grid-cols-2">
      <div className="relative hidden flex-col justify-end bg-[#0f1b33] p-8 md:flex"
        style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,.08) 1px, transparent 1px)', backgroundSize: '16px 16px' }}>
        <p className="mono text-[11px] tracking-[0.1em] text-white/50 uppercase">Launchpad · Vulqan releases</p>
      </div>
      <div className="flex items-center justify-center px-6">
        <div className="w-full max-w-sm">
          <Image src="/vulqan-logo.png" alt="Vulqan" width={30} height={40} priority />

          {!codeMode && (
            <>
              <h1 className="mt-5 text-[26px] font-semibold text-[var(--navy-ink)]">Sign in to Launchpad</h1>
              <p className="mt-1 text-[13px] text-[var(--muted)]">Sprints, test results and tickets for Vulqan releases.</p>
              <form key={formKey} action={signInWithPassword} className="mt-6 space-y-3">
                <input type="hidden" name="next" value={nextValue} />
                <EmailField email={email} domains={domains} />
                <label className="block"><span className="label">Password</span>
                  <input name="password" type="password" required autoComplete="current-password" autoFocus={!!email} className="input mt-1 w-full" />
                </label>
                {error && <p className="text-[12.5px] text-[var(--crit)]">{ERRORS[error] ?? 'Something went wrong.'}</p>}
                <SubmitButton primary className="w-full" pendingText="Signing in…">Sign in</SubmitButton>
              </form>
              <p className="mt-5 text-[12.5px] text-[var(--muted)]">
                First time here, or forgot your password? Ask the lead for a temporary password, or{' '}
                <Link href={`/login?mode=code&next=${encodeURIComponent(nextValue)}`} className="font-semibold text-[var(--accent)] hover:underline">set one by email</Link>
              </p>
            </>
          )}

          {codeMode && !sent && (
            <>
              <h1 className="mt-5 text-[26px] font-semibold text-[var(--navy-ink)]">Set a password</h1>
              <p className="mt-1 text-[13px] text-[var(--muted)]">We email you an 8-digit code. Enter it here with your new password.</p>
              <form key={formKey} action={sendCode} className="mt-6 space-y-3">
                <input type="hidden" name="next" value={nextValue} />
                <EmailField email={email} domains={domains} />
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
                  <input name="code" required inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,12}" className="input mono mt-1 w-full text-[16px] tracking-[0.3em]" placeholder="12345678" />
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

/** Work email as a name plus the company domain, so people type only "parikshit.arora". */
function EmailField({ email, domains }: { email?: string; domains: string[] }) {
  const at = email?.lastIndexOf('@') ?? -1
  const known = at > 0 && domains.includes(email!.slice(at + 1))
  const user = known ? email!.slice(0, at) : email ?? ''
  const domain = known ? email!.slice(at + 1) : domains[0]
  return (
    <div>
      <label htmlFor="login-user" className="label">Work email</label>
      <div className="mt-1 flex">
        <input id="login-user" name="user" required autoComplete="username" autoCapitalize="none" spellCheck={false}
          defaultValue={user} autoFocus={!email} className="input min-w-0 flex-1" placeholder="first.last" />
        {domains.length > 1 ? (
          <select name="domain" defaultValue={domain} aria-label="Email domain" className="select -ml-px w-auto shrink-0 bg-[var(--surface-3)]">
            {domains.map((d) => <option key={d} value={d}>@{d}</option>)}
          </select>
        ) : (
          <>
            <input type="hidden" name="domain" value={domains[0]} />
            <span className="-ml-px flex items-center border border-[var(--line)] bg-[var(--surface-3)] px-3 text-[13px] text-[var(--muted)]">@{domains[0]}</span>
          </>
        )}
      </div>
    </div>
  )
}
