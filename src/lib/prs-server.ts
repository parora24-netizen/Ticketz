import 'server-only'
import { NextResponse, type NextRequest } from 'next/server'
import type { Caller } from '@/lib/ci-api'
import type { PrUpsert } from '@/lib/automation-loop'
import { caseIds, personByName } from '@/lib/asks-server'
import { audit, isDryRun } from '@/lib/automation-server'

/** Reports a pull request, or updates the one with that key; with cases, they replace its list. */
export async function upsertPr(caller: Caller, request: NextRequest, key: string, p: ReturnType<typeof PrUpsert.parse>) {
  const reviewer = p.reviewer ? await personByName(caller.db, p.reviewer) : null
  if (reviewer && 'error' in reviewer) return NextResponse.json({ error: reviewer.error }, { status: 400 })
  const { ids, unmatched } = await caseIds(caller.db, p.cases ?? [])
  const { data: existing } = await caller.db.from('automation_prs').select('id, state').eq('key', key).maybeSingle()
  const now = new Date().toISOString()
  const row = Object.fromEntries(Object.entries({
    key, url: p.url, title: p.title, author: p.author, state: p.state, opened_at: p.opened_at,
    reviewer_id: p.reviewer === undefined ? undefined : reviewer && 'id' in reviewer ? reviewer.id : null,
    merged_at: p.merged_at ?? (p.state === 'merged' && existing?.state !== 'merged' ? now : undefined),
    closed_at: p.state === 'closed' && existing?.state !== 'closed' ? now : undefined,
    updated_at: now, created_via: existing ? undefined : caller.tokenId,
  }).filter(([, v]) => v !== undefined))
  if (isDryRun(request)) return NextResponse.json({ key, created: !existing, changes: row, cases: ids.length, unmatched, dry_run: true })
  const { data, error } = existing
    ? await caller.db.from('automation_prs').update(row).eq('id', existing.id).select('id').single()
    : await caller.db.from('automation_prs').insert(row).select('id').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (p.cases) {
    await caller.db.from('pr_cases').delete().eq('pr_id', data.id)
    if (ids.length) await caller.db.from('pr_cases').insert(ids.map((case_id) => ({ pr_id: data.id, case_id })))
  }
  await audit(caller, request, `${existing ? 'Updated' : 'Reported'} PR ${key}${p.state ? ` (${p.state})` : ''}`, { cases: ids.length })
  return NextResponse.json({ key, created: !existing, cases: ids.length, unmatched }, { status: existing ? 200 : 201 })
}

type PrRow = { key: string; url: string | null; title: string | null; state: string; author: string | null; opened_at: string; merged_at: string | null; closed_at: string | null; pr_cases: { test_cases: { tc_id: string } | { tc_id: string }[] | null }[] | null; reviewer: { name: string } | { name: string }[] | null }
const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v)
export function prJson(r: PrRow) {
  return {
    key: r.key, url: r.url, title: r.title, state: r.state, author: r.author, reviewer: one(r.reviewer)?.name ?? null,
    opened_at: r.opened_at, merged_at: r.merged_at, closed_at: r.closed_at,
    age_days: Math.floor(((r.merged_at || r.closed_at ? Date.parse(r.merged_at ?? r.closed_at!) : Date.now()) - Date.parse(r.opened_at)) / 864e5),
    cases: (r.pr_cases ?? []).map((l) => one(l.test_cases)?.tc_id).filter(Boolean),
  }
}
