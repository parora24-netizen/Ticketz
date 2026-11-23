'use client'

/**
 * What stands between a fix sprint and closure: its open tickets grouped by the step they wait on
 * (an owner, a fix, an unblock, a retest, an answer) and who holds each. A person opens the board on
 * their cards; the counts are the whole sprint, whatever the board is filtered to.
 */
export type ClosureCard = {
  id: string
  stage: string
  priority: string
  owner: { id: string | null; name: string | null }
  waiting: { key: string; owner: string | null }[]
  closable: boolean
}

type Person = { id: string | null; name: string | null; n: number }

function byPerson(list: ClosureCard[]): Person[] {
  const m = new Map<string, Person>()
  for (const c of list) {
    const k = c.owner.id ?? '__none'
    const p = m.get(k) ?? { id: c.owner.id, name: c.owner.name, n: 0 }
    p.n++
    m.set(k, p)
  }
  return [...m.values()].sort((a, b) => (a.id ? 0 : -1) - (b.id ? 0 : -1) || b.n - a.n)
}

/** Weekdays from today to the last day, both counted. */
function workingDaysLeft(today: string, endsOn: string): number {
  let n = 0
  for (let d = new Date(`${today}T00:00:00Z`); d <= new Date(`${endsOn}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    const w = d.getUTCDay()
    if (w !== 0 && w !== 6) n++
  }
  return n
}

export function ClosureSummary({ sprintName, cards, today, endsOn, onPerson, onHigh, onClose, closing }: {
  sprintName: string
  cards: ClosureCard[]
  today: string
  endsOn: string
  onPerson: (id: string | null) => void
  onHigh: () => void
  onClose?: () => void
  closing?: boolean
}) {
  const open = cards.filter((c) => c.stage !== 'done')
  if (!open.length) {
    return <section className="card mb-2 px-4 py-3 text-[13px]"><b className="font-semibold text-[var(--good)]">Every ticket in {sprintName} is done.</b> It can be finished.</section>
  }
  const days = workingDaysLeft(today, endsOn)
  const perDay = days > 0 ? Math.ceil(open.length / days) : null
  const at = (s: string) => open.filter((c) => c.stage === s)
  const closable = open.filter((c) => c.closable)
  const high = open.filter((c) => c.priority === 'Critical' || c.priority === 'High')
  const asks = [...open.flatMap((c) => c.waiting).reduce((m, a) => m.set(a.owner ?? '', [...new Set([...(m.get(a.owner ?? '') ?? []), a.key])]), new Map<string, string[]>())]
  const waitingCount = open.filter((c) => c.waiting.length).length

  const chips = (people: Person[], noneLabel: string) => people.map((p) => (
    <button key={p.id ?? '__none'} type="button" onClick={() => onPerson(p.id)}
      className={`chip px-2 text-[11.5px] hover:border-[var(--navy)] ${p.id ? '' : 'border-[var(--crit-line)] bg-[var(--crit-soft)] font-semibold text-[var(--crit)]'}`}>
      {p.name ?? noneLabel} · {p.n}
    </button>
  ))
  const rows: { label: string; n: number; what: string; body: React.ReactNode }[] = [
    { label: 'Not started', n: at('triage').length, what: 'Owner starts the fix', body: chips(byPerson(at('triage')), 'No owner') },
    { label: 'Being fixed', n: at('fix').length, what: 'Developer marks it ready for retest with the build', body: chips(byPerson(at('fix')), 'No owner') },
    { label: 'Blocked', n: at('blocked').length, what: 'Clear what blocks it', body: chips(byPerson(at('blocked')), 'No owner') },
    { label: 'Waiting for retest', n: at('retest').length, what: 'Tester passes it (closes) or fails it (reopens)', body: chips(byPerson(at('retest')), 'No tester') },
    { label: 'Waiting on an ask', n: waitingCount, what: 'Someone answers, then the case can be tested', body: asks.map(([who, keys]) => (
      <span key={who} className="text-[11.5px]">{who || 'Nobody yet'}: {keys.map((k, i) => <span key={k}>{i > 0 && ', '}<a href={`/asks/${k}`} className="text-[var(--accent)] hover:underline">{k}</a></span>)}</span>
    )) },
  ].filter((r) => r.n > 0)

  return (
    <section className="card mb-2 px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-[14px] font-semibold text-[var(--navy-ink)]">To close {sprintName}: {open.length} open ticket{open.length === 1 ? '' : 's'}</h3>
        <p className="text-[12px] text-[var(--muted)]">
          {days > 0 ? <>{days} working day{days === 1 ? '' : 's'} left · about <b className="text-[var(--ink-2)]">{perDay} a day</b> to finish on time</> : <b className="text-[var(--crit)]">Past its end date</b>}
          {high.length > 0 && <> · <button type="button" onClick={onHigh} className="font-semibold text-[var(--crit)] hover:underline">{high.length} Critical or High</button></>}
        </p>
      </div>
      <table className="mt-2 w-full text-[12.5px]">
        <tbody className="divide-y divide-[var(--row)]">
          {closable.length > 0 && (
            <tr>
              <td className="w-[170px] py-1.5 pr-3 align-top font-semibold text-[var(--good)]">Can close now · {closable.length}</td>
              <td className="py-1.5 align-top text-[var(--muted)]">Their case passes again, so no fix is needed.</td>
              <td className="py-1.5 text-right align-top">{onClose && <button type="button" disabled={closing} onClick={onClose} className="btn btn-sm">{closing ? 'Closing…' : `Close ${closable.length}`}</button>}</td>
            </tr>
          )}
          {rows.map((r) => (
            <tr key={r.label}>
              <td className="w-[170px] py-1.5 pr-3 align-top font-semibold text-[var(--ink-2)]">{r.label} · {r.n}</td>
              <td className="py-1.5 align-top" colSpan={2}>
                <div className="flex flex-wrap items-center gap-1.5">{r.body}</div>
                <div className="mt-0.5 text-[11px] text-[var(--faint)]">{r.what}</div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}
