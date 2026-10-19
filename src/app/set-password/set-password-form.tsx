'use client'

import { useState, useTransition } from 'react'
import { finishTempPassword } from '@/app/(app)/account-actions'

export function SetPasswordForm() {
  const [error, setError] = useState<string | null>(null)
  const [pending, start] = useTransition()
  return (
    <form className="mt-6 space-y-3" action={(fd) => start(async () => {
      const res = await finishTempPassword(fd)
      if (res?.error) setError(res.error)
    })}>
      <label className="block"><span className="label">New password</span>
        <input name="password" type="password" required minLength={8} autoFocus autoComplete="new-password" className="input mt-1 w-full" />
      </label>
      <label className="block"><span className="label">Same password again</span>
        <input name="confirm" type="password" required minLength={8} autoComplete="new-password" className="input mt-1 w-full" />
      </label>
      <p className="text-[12px] text-[var(--muted)]">At least 8 characters.</p>
      {error && <p className="text-[12.5px] text-[var(--crit)]">{error}</p>}
      <button disabled={pending} className="btn btn-primary w-full">{pending ? 'Saving…' : 'Save and continue'}</button>
    </form>
  )
}
