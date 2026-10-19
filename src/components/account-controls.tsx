'use client'

import { useState, useTransition } from 'react'
import { Dialog } from '@/components/dialog'
import { toast } from '@/components/toast'
import { changePassword, setTempPassword } from '@/app/(app)/account-actions'

/** Admin › Team: give someone a temporary password to sign in with, shown once. */
export function TempPasswordPanel({ people }: { people: { id: string; name: string; email: string | null }[] }) {
  const [person, setPerson] = useState('')
  const [result, setResult] = useState<{ name: string; email: string; password: string } | null>(null)
  const [pending, start] = useTransition()
  return (
    <section className="card mt-4 p-4">
      <h2 className="text-[14px] font-semibold text-[var(--navy-ink)]">Give someone a sign-in</h2>
      <p className="mt-0.5 text-[12.5px] text-[var(--muted)]">
        Makes a temporary password, no email needed. Send it to them directly; they can change it from their profile menu.
      </p>
      <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={(e) => {
        e.preventDefault()
        const p = people.find((x) => x.id === person)
        if (!p) return
        start(async () => {
          const res = await setTempPassword(p.id)
          if (res.error || !res.password) toast(res.error ?? 'Could not set a password', 'error')
          else setResult({ name: p.name, email: res.email!, password: res.password })
        })
      }}>
        <select value={person} onChange={(e) => setPerson(e.target.value)} required aria-label="Person" className="select w-72">
          <option value="">Pick a person</option>
          {people.map((p) => <option key={p.id} value={p.id} disabled={!p.email}>{p.name}{p.email ? '' : ' (no email)'}</option>)}
        </select>
        <button disabled={pending || !person} className="btn btn-primary">{pending ? 'Making…' : 'Make temporary password'}</button>
      </form>
      <Dialog open={!!result} onClose={() => setResult(null)} title={`Sign-in for ${result?.name ?? ''}`}>
        {result && (
          <div className="space-y-3 text-[13px]">
            <p>Send this to {result.name} directly. It is not shown again; make a new one if it gets lost.</p>
            <div className="border border-[var(--line)] bg-[var(--surface-3)] p-3">
              <div className="label">Email</div>
              <div className="mono">{result.email}</div>
              <div className="label mt-2">Temporary password</div>
              <div className="mono text-[16px] tracking-wide">{result.password}</div>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" className="btn" onClick={() => {
                void navigator.clipboard.writeText(`Launchpad: https://vulqan-launchpad.vercel.app\nEmail: ${result.email}\nTemporary password: ${result.password}`)
                  .then(() => toast('Copied'), () => toast('Copy failed; select the text instead', 'error'))
              }}>Copy message</button>
              <button type="button" className="btn btn-primary" onClick={() => setResult(null)}>Done</button>
            </div>
          </div>
        )}
      </Dialog>
    </section>
  )
}

/** Profile menu: change your own password while signed in. */
export function ChangePasswordButton() {
  const [open, setOpen] = useState(false)
  const [pw, setPw] = useState('')
  const [again, setAgain] = useState('')
  const [pending, start] = useTransition()
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="btn w-full">Change password</button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Change password">
        <form className="space-y-3" onSubmit={(e) => {
          e.preventDefault()
          start(async () => {
            const res = await changePassword(pw, again)
            if (res.error) toast(res.error, 'error')
            else { toast('Password changed'); setPw(''); setAgain(''); setOpen(false) }
          })
        }}>
          <label className="block"><span className="label">New password</span>
            <input type="password" required minLength={8} autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} className="input mt-1 w-full" />
          </label>
          <label className="block"><span className="label">Same password again</span>
            <input type="password" required minLength={8} autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} className="input mt-1 w-full" />
          </label>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setOpen(false)} className="btn">Cancel</button>
            <button disabled={pending} className="btn btn-primary">{pending ? 'Saving…' : 'Save password'}</button>
          </div>
        </form>
      </Dialog>
    </>
  )
}
