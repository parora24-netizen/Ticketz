'use client'

import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { Dialog } from '@/components/dialog'
import { toast } from '@/components/toast'
import { ACTION_LABEL, STATE_LABEL, requiredFor, type TicketState } from '@/lib/workflow/ticket-machine'
import { moveTicketFromBoard, updateTickets } from '@/app/(app)/actions'

const ASK = {
  fixed_in_build: { title: 'Which build has the fix?', placeholder: 'e.g. b39a5eab1', field: 'fixed_in_build', required: true },
  defer_reason: { title: 'Why can this wait past 26.111?', placeholder: 'Reason', field: 'defer_reason', required: true },
  duplicate_of: { title: 'Which ticket does this duplicate?', placeholder: 'e.g. DEV-TC_FN_070', field: 'duplicate_key', required: true },
  retest: { title: 'What did the retest show?', placeholder: 'Optional note for the developer', field: 'note', required: false },
} as const

/** The ticket's next moves, as header buttons. Moves that need a detail ask for it in a dialog. */
export function TicketActions({ ticketId, moves }: { ticketId: string; moves: TicketState[] }) {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [ask, setAsk] = useState<{ to: TicketState; kind: keyof typeof ASK } | null>(null)
  const [value, setValue] = useState('')

  function run(to: TicketState, extra: Record<string, string> = {}) {
    start(async () => {
      const res = await moveTicketFromBoard({ ticket_id: ticketId, to, ...extra } as Parameters<typeof moveTicketFromBoard>[0])
      if (res.error) toast(res.error, 'error')
      else {
        toast(`Moved to ${STATE_LABEL[to]}`)
        router.refresh()
      }
    })
  }

  function click(to: TicketState) {
    const need = requiredFor(to)
    const kind = need ?? (to === 'reopened' ? 'retest' : null)
    if (kind) {
      setValue('')
      setAsk({ to, kind })
    } else run(to)
  }

  // Forward moves first and primary; Defer and Duplicate are quiet.
  const order = (t: TicketState) => (['deferred', 'duplicate'].includes(t) ? 1 : 0)
  const sorted = [...moves].sort((a, b) => order(a) - order(b))
  const q = ask ? ASK[ask.kind] : null
  return (
    <>
      {sorted.map((to, i) => (
        <button key={to} type="button" disabled={pending} onClick={() => click(to)}
          className={`btn ${i === 0 && order(to) === 0 ? 'btn-primary' : ''}`}>
          {pending ? '…' : ACTION_LABEL[to] ?? STATE_LABEL[to]}
        </button>
      ))}
      <Dialog open={!!ask} onClose={() => setAsk(null)} title={q?.title ?? ''}>
        {ask && q && (
          <form onSubmit={(e) => { e.preventDefault(); run(ask.to, value.trim() ? { [q.field]: value.trim() } : {}); setAsk(null) }}>
            <input autoFocus required={q.required} value={value} onChange={(e) => setValue(e.target.value)} placeholder={q.placeholder} className="input w-full" />
            <div className="mt-3 flex justify-end gap-2">
              <button type="button" onClick={() => setAsk(null)} className="btn">Cancel</button>
              <button className="btn btn-primary">{ACTION_LABEL[ask.to] ?? STATE_LABEL[ask.to]}</button>
            </div>
          </form>
        )}
      </Dialog>
    </>
  )
}

/** Owner and severity in the side panel: change and it saves. */
export function TicketField({ ticketId, field, value, options, disabled }: {
  ticketId: string
  field: 'owner_id' | 'severity'
  value: string
  options: { value: string; label: string }[]
  disabled?: boolean
}) {
  const router = useRouter()
  const [v, setV] = useState(value)
  const [pending, start] = useTransition()
  return (
    <select value={v} disabled={disabled || pending} className="select w-full" aria-label={field === 'owner_id' ? 'Owner' : 'Severity'}
      onChange={(e) => {
        const next = e.target.value
        const before = v
        setV(next)
        start(async () => {
          const res = await updateTickets([ticketId], { [field]: next === '' ? null : next } as Parameters<typeof updateTickets>[1])
          if (res.error) {
            setV(before)
            toast(res.error, 'error')
          } else {
            toast(field === 'owner_id' ? 'Owner saved' : 'Severity saved')
            router.refresh()
          }
        })
      }}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}
