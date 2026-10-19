import Image from 'next/image'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { SetPasswordForm } from './set-password-form'

/** First sign-in with a temporary password from the lead: choose your own before using the app. */
export default async function SetPasswordPage() {
  const supabase = await createClient()
  const { data: auth } = await supabase.auth.getClaims()
  const email = typeof auth?.claims?.email === 'string' ? auth.claims.email : null
  if (!email) redirect('/login')
  const meta = auth?.claims?.user_metadata as { must_change_password?: boolean } | undefined
  if (!meta?.must_change_password) redirect('/')
  return (
    <main className="flex min-h-screen items-center justify-center bg-white px-6">
      <div className="w-full max-w-sm">
        <Image src="/vulqan-logo.png" alt="Vulqan" width={30} height={40} priority />
        <h1 className="mt-5 text-[26px] font-semibold text-[var(--navy-ink)]">Choose your password</h1>
        <p className="mt-1 text-[13px] text-[var(--muted)]">
          You signed in as <strong className="text-[var(--ink)]">{email}</strong> with a temporary password. Pick your own to carry on.
        </p>
        <SetPasswordForm />
      </div>
    </main>
  )
}
