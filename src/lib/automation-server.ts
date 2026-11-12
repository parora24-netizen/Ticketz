import 'server-only'
import type { NextRequest } from 'next/server'
import type { z } from 'zod'
import type { Caller } from '@/lib/ci-api'
import type { CaseAutomation } from '@/lib/automation-loop'
import { casesByAnyId } from '@/lib/ids'
import { ticketId } from '@/lib/asks-server'

/** `?dry_run=true` on a write: say what would change, change nothing. */
export const isDryRun = (request: NextRequest) => ['1', 'true'].includes(request.nextUrl.searchParams.get('dry_run') ?? '')

/** What a token changed through the API, for GET /api/audit. Never fails the call it records. */
export async function audit(c: Caller, request: NextRequest, summary: string, details?: unknown) {
  await c.db.from('api_log').insert({ token_id: c.tokenId, method: request.method, path: request.nextUrl.pathname, summary: summary.slice(0, 500), details: details ?? null })
}

type Item = z.infer<typeof CaseAutomation> & { tc_id: string }
export type CaseOutcome = { tc_id: string; status: 'updated' | 'unchanged' | 'conflict' | 'not_found' | 'error' | 'would_update'; error?: string; revision?: number; changes?: Record<string, unknown> }

/**
 * Sets automation fields on cases, each only if its revision is the one the caller worked from:
 * a newer revision means a person changed the case's text since, so that case is left alone and
 * reported as a conflict. Case text itself is never written here.
 */
export async function applyCaseAutomation(c: Caller, items: Item[], dryRun: boolean): Promise<CaseOutcome[]> {
  const found = await casesByAnyId(c.db, items.map((i) => i.tc_id))
  const ids = [...new Set([...found.values()].map((x) => x.id))]
  const { data: rows } = ids.length ? await c.db.from('test_cases').select('id, tc_id, revision, automation, automation_note, automation_owner, automation_ref, automation_block, automation_block_ticket_id, automation_proposed, automation_proposed_reason').in('id', ids) : { data: [] }
  const byId = new Map((rows ?? []).map((r) => [r.id as string, r as Record<string, unknown>]))
  const out: CaseOutcome[] = []
  for (const { tc_id, revision, automation_status, automation_block_ticket: blockRef, automation_ask, ...rest } of items) {
    // An ask key given as the blocking ticket is the ask the case waits on.
    const askKey = (automation_ask ?? (blockRef && /^ASK-\d+$/i.test(blockRef) ? blockRef : undefined))?.toUpperCase()
    const automation_block_ticket = askKey && blockRef?.toUpperCase() === askKey ? undefined : blockRef
    const ref = found.get(tc_id.toUpperCase())
    const row = ref && byId.get(ref.id)
    if (!row) { out.push({ tc_id, status: 'not_found' }); continue }
    if (revision !== undefined && revision !== row.revision) {
      out.push({ tc_id: row.tc_id as string, status: 'conflict', revision: row.revision as number, error: `The case is at revision ${row.revision}; someone changed its text since revision ${revision}` })
      continue
    }
    const fields: Record<string, unknown> = { ...rest }
    if (automation_status) fields.automation = automation_status
    if (automation_block_ticket !== undefined) {
      const t = automation_block_ticket ? await ticketId(c.db, automation_block_ticket) : null
      if (automation_block_ticket && !t) { out.push({ tc_id, status: 'error', error: `No ticket ${automation_block_ticket}` }); continue }
      fields.automation_block_ticket_id = t
    }
    let askId: string | null = null
    if (askKey) {
      const { data: ask } = await c.db.from('asks').select('id').eq('key', askKey).maybeSingle()
      if (!ask) { out.push({ tc_id, status: 'error', error: `No ask ${askKey}` }); continue }
      askId = ask.id
    }
    if (rest.automation_proposed !== undefined) fields.automation_proposed_at = rest.automation_proposed ? new Date().toISOString() : null
    // Unblocking clears why it was blocked.
    if (automation_status && automation_status !== 'blocked' && rest.automation_block === undefined) { fields.automation_block = null; fields.automation_block_ticket_id = null }
    const changes = Object.fromEntries(Object.entries(fields).filter(([k, v]) => k !== 'automation_proposed_at' && row[k] !== v))
    if (askId && !dryRun) await c.db.from('ask_cases').upsert({ ask_id: askId, case_id: ref.id }, { ignoreDuplicates: true })
    if (askId) changes.automation_ask = askKey
    if (!Object.keys(changes).length) { out.push({ tc_id: row.tc_id as string, status: 'unchanged', revision: row.revision as number }); continue }
    if (dryRun) { out.push({ tc_id: row.tc_id as string, status: 'would_update', changes, revision: row.revision as number }); continue }
    const { error } = Object.keys(fields).length ? await c.db.from('test_cases').update(fields).eq('id', ref.id).eq('revision', row.revision as number) : { error: null }
    out.push(error ? { tc_id, status: 'error', error: error.message } : { tc_id: row.tc_id as string, status: 'updated', changes, revision: row.revision as number })
  }
  return out
}
