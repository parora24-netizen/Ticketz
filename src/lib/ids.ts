import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Launchpad makes its own IDs (TC_1, DEV-1). The IDs from before the renumbering still work for
 * now, so the automated suite and old links keep landing in the right place. Remove this with the
 * legacy_tc_id and legacy_key columns.
 */
export type CaseRef = { id: string; tc_id: string; automation: string; retired_at?: string | null }

/** Test cases by current or old ID, keyed by the ID as asked for (upper case). */
export async function casesByAnyId(db: SupabaseClient, ids: string[]): Promise<Map<string, CaseRef>> {
  const wanted = [...new Set(ids.map((x) => x.trim().toUpperCase()))]
  const found = new Map<string, CaseRef>()
  for (let i = 0; i < wanted.length; i += 500) {
    const batch = wanted.slice(i, i + 500)
    const [old, current] = await Promise.all([
      db.from('test_cases').select('id, tc_id, automation, retired_at, legacy_tc_id').in('legacy_tc_id', batch),
      db.from('test_cases').select('id, tc_id, automation, retired_at').in('tc_id', batch),
    ])
    if (old.error || current.error) throw new Error((old.error ?? current.error)!.message)
    for (const c of old.data ?? []) found.set(c.legacy_tc_id as string, { id: c.id, tc_id: c.tc_id, automation: c.automation, retired_at: c.retired_at })
    for (const c of current.data ?? []) found.set(c.tc_id, c as CaseRef) // a current ID wins
  }
  return found
}

/** Current IDs for a list that may hold old ones, for filtering. */
export async function currentTcIds(db: SupabaseClient, ids: string[]): Promise<string[]> {
  return [...new Set([...(await casesByAnyId(db, ids)).values()].map((c) => c.tc_id))]
}

/** A ticket's current key from its current or old key, or null. */
export async function currentTicketKey(db: SupabaseClient, raw: string): Promise<string | null> {
  const key = raw.trim().toUpperCase()
  const { data: current } = await db.from('tickets').select('key').eq('key', key).maybeSingle()
  if (current) return current.key
  const { data: old } = await db.from('tickets').select('key').eq('legacy_key', key).maybeSingle()
  return old?.key ?? null
}
