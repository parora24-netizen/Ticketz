'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import type { StandupCard, StandupItem } from '@/lib/standup'

const ROLE = { lead: 'Lead', dev: 'Dev', qa: 'QA' } as const
type Filter = 'all' | 'dev' | 'qa'

function Items({ items, empty }: { items: StandupItem[]; empty: string }) {
  if (!items.length) return <p className="text-[12.5px] text-[var(--faint)]">{empty}</p>
  return (
    <ul className="space-y-1.5">
      {items.map((i, n) => (
        <li key={`${i.ref}-${n}`} className="flex items-start gap-2 text-[12.5px]">
          <Link href={i.href} className="mono shrink-0 text-[11.5px] font-medium text-[var(--accent)] hover:underline">{i.ref}</Link>
          <span className="min-w-0 flex-1">
            <span className="line-clamp-1">{i.title}</span>
            <span className={`text-[11.5px] ${i.tone === 'crit' ? 'text-[var(--crit)]' : i.tone === 'warn' ? 'text-[var(--warn)]' : 'text-[var(--faint)]'}`}>{i.note}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}

/** One person's standup: what moved since yesterday, what is on today, what is stuck. */
export function StandupPersonCard({ card, big }: { card: StandupCard; big?: boolean }) {
  return (
    <article className={`card flex flex-col ${big ? 'min-h-[260px]' : ''}`}>
      <header className="flex items-center gap-3 border-b border-[var(--line)] px-4 py-3">
        <span className="flex h-8 w-8 items-center justify-center bg-[#2b57c4] text-[12px] font-semibold text-white">{card.person.name.slice(0, 2).toUpperCase()}</span>
        <div className="flex-1">
          <div className={`${big ? 'text-[20px]' : 'text-[15px]'} heading font-semibold text-[var(--navy-ink)]`}>{card.person.name}</div>
          <div className="label">{ROLE[card.person.role]}</div>
        </div>
        {card.blocked.length > 0 && <span className="chip border-[var(--crit-line)] bg-[var(--crit-soft)] text-[var(--crit)]">{card.blocked.length} blocked</span>}
      </header>
      <div className={`grid flex-1 gap-4 p-4 ${big ? 'md:grid-cols-3' : ''}`}>
        <section>
          <h3 className="label mb-2">Since yesterday · {card.yesterday.length}</h3>
          {card.yesterday.length === 0 ? <p className="text-[12.5px] text-[var(--faint)]">Nothing recorded in the tracker.</p> : (
            <ul className="space-y-1.5">
              {card.yesterday.slice(0, big ? 15 : 5).map((y, n) => (
                <li key={`${y.ref}-${n}`} className="flex items-start gap-2 text-[12.5px]">
                  <Link href={y.href} className="mono shrink-0 text-[11.5px] font-medium text-[var(--accent)] hover:underline">{y.ref}</Link>
                  <span className="min-w-0 flex-1 text-[var(--ink-2)]">{y.what.replaceAll('_', ' ')}</span>
                </li>
              ))}
              {card.yesterday.length > (big ? 15 : 5) && <li className="text-[11.5px] text-[var(--faint)]">+{card.yesterday.length - (big ? 15 : 5)} more</li>}
            </ul>
          )}
        </section>
        <section>
          <h3 className="label mb-2">Today · {card.today.length}</h3>
          <Items items={big ? card.today : card.today.slice(0, 5)} empty="Nothing in progress." />
        </section>
        <section>
          <h3 className="label mb-2">Blocked or stuck · {card.blocked.length}</h3>
          <Items items={card.blocked} empty="Nothing stuck." />
        </section>
      </div>
    </article>
  )
}

/** Walk the team one person at a time (← →), or see everyone at once. */
export function StandupDeck({ cards, unassigned }: { cards: StandupCard[]; unassigned: StandupItem[] }) {
  const [filter, setFilter] = useState<Filter>('all')
  const [mode, setMode] = useState<'walk' | 'grid'>('walk')
  const [i, setI] = useState(0)
  const list = cards.filter((c) => filter === 'all' || c.person.role === filter)
  const total = list.length + (unassigned.length ? 1 : 0)
  const at = Math.min(i, Math.max(total - 1, 0))

  useEffect(() => {
    if (mode !== 'walk') return
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input,select,textarea')) return
      if (e.key === 'ArrowRight') setI((v) => Math.min(v + 1, total - 1))
      if (e.key === 'ArrowLeft') setI((v) => Math.max(v - 1, 0))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [mode, total])

  const unassignedCard = (
    <article className="card">
      <header className="border-b border-[var(--line)] px-4 py-3">
        <div className="heading text-[18px] font-semibold text-[var(--navy-ink)]">Unassigned</div>
        <div className="label">Open tickets nobody owns · decide owners now</div>
      </header>
      <div className="p-4"><Items items={unassigned.slice(0, 25)} empty="Everything has an owner." /></div>
      {unassigned.length > 25 && <p className="px-4 pb-3 text-[12px] text-[var(--muted)]"><Link href="/tickets?view=grid" className="text-[var(--accent)] hover:underline">All {unassigned.length} in the grid</Link></p>}
    </article>
  )

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex border border-[var(--line)] bg-white p-0.5">
          {(['walk', 'grid'] as const).map((m) => (
            <button key={m} type="button" onClick={() => setMode(m)}
              className={`px-3 py-1 text-[12.5px] font-semibold ${mode === m ? 'bg-[var(--navy)] text-white' : 'text-[var(--ink-2)]'}`}>
              {m === 'walk' ? 'One at a time' : 'Everyone'}
            </button>
          ))}
        </div>
        <select value={filter} onChange={(e) => { setFilter(e.target.value as Filter); setI(0) }} className="select" aria-label="Who">
          <option value="all">Everyone</option><option value="dev">Devs</option><option value="qa">QA</option>
        </select>
        {mode === 'walk' && total > 0 && (
          <div className="ml-auto flex items-center gap-2">
            <span className="mono text-[11px] text-[var(--faint)]">{at + 1} / {total} · ← →</span>
            <button type="button" className="btn" disabled={at === 0} onClick={() => setI(at - 1)}>Previous</button>
            <button type="button" className="btn btn-primary" disabled={at >= total - 1} onClick={() => setI(at + 1)}>Next person</button>
          </div>
        )}
      </div>

      {mode === 'walk' ? (
        <>
          <div className="mb-3 flex flex-wrap gap-1">
            {list.map((c, n) => (
              <button key={c.person.id} type="button" onClick={() => setI(n)}
                className={`flex h-7 items-center gap-1 px-2 text-[12px] ${n === at ? 'bg-[var(--navy)] text-white' : 'border border-[var(--line)] bg-white text-[var(--ink-2)]'}`}>
                {c.person.name}{c.blocked.length > 0 && <span className={n === at ? 'text-white' : 'text-[var(--crit)]'}>●</span>}
              </button>
            ))}
            {unassigned.length > 0 && (
              <button type="button" onClick={() => setI(list.length)}
                className={`h-7 px-2 text-[12px] ${at === list.length ? 'bg-[var(--navy)] text-white' : 'border border-dashed border-[var(--line)] bg-white text-[var(--ink-2)]'}`}>
                Unassigned · {unassigned.length}
              </button>
            )}
          </div>
          {at < list.length ? <StandupPersonCard card={list[at]} big /> : unassignedCard}
        </>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {list.map((c) => <StandupPersonCard key={c.person.id} card={c} />)}
          {unassigned.length > 0 && unassignedCard}
        </div>
      )}
    </div>
  )
}
