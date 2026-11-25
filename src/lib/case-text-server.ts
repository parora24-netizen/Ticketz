import 'server-only'
import type { Caller } from '@/lib/ci-api'
import { casesByAnyId } from '@/lib/ids'
import { TEXT_FIELDS, type CaseCreateInput, type CaseTextInput } from '@/lib/case-text'

export type TextOutcome = {
  tc_id: string
  status: 'updated' | 'would_update' | 'unchanged' | 'conflict' | 'not_found' | 'error'
  changes?: Record<string, unknown>
  revision?: number
  error?: string
}

const day = () => new Date().toISOString()

/**
 * Change test cases' text (and retire, defer or restore them) as the token's person. A text change
 * bumps the case's revision and text_updated_at (the database does that, as for an edit in the app)
 * and lands in the case history under the token's person. A comment, if given, is posted on the case.
 */
export async function applyCaseText(c: Caller, items: (CaseTextInput & { tc_id: string })[], dryRun: boolean): Promise<TextOutcome[]> {
  const found = await casesByAnyId(c.db, items.map((i) => i.tc_id))
  const ids = [...new Set([...found.values()].map((x) => x.id))]
  const { data: rows } = ids.length
    ? await c.db.from('test_cases').select('id, tc_id, revision, title, preconditions, steps, test_data, expected, priority, retired_at, retired_as, retired_reason').in('id', ids)
    : { data: [] }
  const byId = new Map((rows ?? []).map((r) => [r.id as string, r as Record<string, unknown>]))
  const out: TextOutcome[] = []
  for (const { tc_id, revision, retired, retired_as, retired_reason, comment, ...rest } of items) {
    const ref = found.get(tc_id.toUpperCase())
    const row = ref && byId.get(ref.id)
    if (!row) { out.push({ tc_id, status: 'not_found' }); continue }
    if (revision !== undefined && revision !== row.revision) {
      out.push({ tc_id: row.tc_id as string, status: 'conflict', revision: row.revision as number, error: `The case is at revision ${row.revision}; it was changed since revision ${revision}` })
      continue
    }
    // Only the fields that differ; empty text clears a field.
    const fields: Record<string, unknown> = {}
    for (const k of TEXT_FIELDS) {
      const v = rest[k]
      if (v === undefined) continue
      const next = typeof v === 'string' && !v ? null : v
      if (row[k] !== next) fields[k] = next
    }
    if (retired === true && (!row.retired_at || row.retired_as !== (retired_as ?? 'retired') || row.retired_reason !== retired_reason)) {
      Object.assign(fields, { retired_at: row.retired_at ?? day(), retired_by: c.actorId, retired_as: retired_as ?? 'retired', retired_reason })
    }
    if (retired === false && row.retired_at) Object.assign(fields, { retired_at: null, retired_by: null, retired_as: null, retired_reason: null })
    const changes = Object.fromEntries(Object.entries(fields).filter(([k]) => k !== 'retired_by'))
    if (!Object.keys(fields).length && !comment) { out.push({ tc_id: row.tc_id as string, status: 'unchanged', revision: row.revision as number }); continue }
    if (dryRun) { out.push({ tc_id: row.tc_id as string, status: 'would_update', changes: comment ? { ...changes, comment } : changes, revision: row.revision as number }); continue }
    if (Object.keys(fields).length) {
      const { data: upd, error } = await c.db.from('test_cases').update({ ...fields, updated_at: day() }).eq('id', ref.id).eq('revision', row.revision as number).select('revision').maybeSingle()
      if (error) { out.push({ tc_id, status: 'error', error: error.message }); continue }
      if (!upd) { out.push({ tc_id: row.tc_id as string, status: 'conflict', error: 'The case changed while this was being applied; read it again' }); continue }
      // A retired or deferred case takes its open tickets with it, as in the app.
      if (fields.retired_at && retired) {
        const why = `Test case ${retired_as ?? 'retired'}: ${retired_reason}`.slice(0, 2000)
        await c.db.from('tickets').update({ state: 'deferred', defer_reason: why }).eq('case_id', ref.id).not('state', 'in', '(closed,deferred,duplicate)')
      }
      row.revision = upd.revision
    }
    if (comment && c.actorId) await c.db.from('case_comments').insert({ case_id: ref.id, author_id: c.actorId, body: comment })
    out.push({ tc_id: row.tc_id as string, status: 'updated', changes: comment ? { ...changes, comment } : changes, revision: row.revision as number })
  }
  return out
}

/** Add a test case: the server gives it the next TC_ id and returns it. */
export async function createCase(c: Caller, p: CaseCreateInput, dryRun: boolean): Promise<{ tc_id?: string; error?: string; status?: number; would_create?: Record<string, unknown> }> {
  const { data: area } = await c.db.from('areas').select('id, zone, page').ilike('zone', p.zone).ilike('page', p.page).maybeSingle()
  if (!area) return { error: `No page ${p.zone} › ${p.page}`, status: 400 }
  let testerId: string | null = null
  if (p.tester) {
    const { data: person } = await c.db.from('people').select('id').ilike('name', p.tester).eq('active', true).maybeSingle()
    if (!person) return { error: `No one on the team is called ${p.tester}`, status: 400 }
    testerId = person.id as string
  }
  const row = {
    area_id: area.id, source_page: area.page, title: p.title, priority: p.priority, test_type: p.test_type ?? null,
    preconditions: p.preconditions || null, steps: p.steps || null, test_data: p.test_data || null, expected: p.expected || null,
    tester_id: testerId, created_by: c.actorId, ...(p.scenario_id ? { scenario_id: p.scenario_id.toUpperCase() } : {}),
  }
  if (dryRun) return { would_create: { zone: area.zone, page: area.page, ...row, area_id: undefined, created_by: undefined } }
  const { data: nextId, error: idError } = await c.db.rpc('next_tc_id')
  if (idError) return { error: idError.message, status: 500 }
  const tcId = String(nextId)
  const { data: made, error } = await c.db.from('test_cases').insert({ tc_id: tcId, ...row }).select('id').single()
  if (error) return { error: error.code === '23505' ? `${tcId} already exists` : error.message, status: error.code === '23505' ? 409 : 500 }
  if (p.comment && c.actorId) await c.db.from('case_comments').insert({ case_id: made.id, author_id: c.actorId, body: p.comment })
  return { tc_id: tcId }
}
