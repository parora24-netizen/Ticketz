'use server'

import { createHash, randomBytes } from 'node:crypto'
import { open as unseal, seal } from '@/lib/secret-box'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'
import { z } from 'zod'
import { getMe, safeNext } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import { currentSprint, loadSprints, trackOf } from '@/lib/data'
import { canMove, requiredFor, retestResult, type TicketState } from '@/lib/workflow/ticket-machine'

function back(formData: FormData, fallback: string): string {
  return safeNext(formData.get('back') ?? fallback)
}

function withMessage(path: string, key: 'error' | 'ok', msg: string): string {
  const [base, query = ''] = path.split('?')
  const params = new URLSearchParams(query)
  params.delete('error')
  params.delete('ok')
  params.set(key, msg)
  return `${base}?${params.toString()}`
}

function fail(path: string, msg: string): never {
  redirect(withMessage(path, 'error', msg))
}

async function activeSprintId(): Promise<string | null> {
  return currentSprint(await loadSprints())?.id ?? null
}

/**
 * Where a new ticket is fixed: the next fix sprint to start, since the one running now was planned
 * from what the last test sprint found. Falls back to the running fix sprint near the end.
 */
async function fixSprintId(): Promise<string | null> {
  const today = new Date().toISOString().slice(0, 10)
  const fix = (await loadSprints()).filter((s) => s.kind === 'fix' && s.status !== 'closed')
  return (fix.find((s) => s.starts_on > today && s.status === 'planned') ?? fix.find((s) => s.ends_on >= today))?.id ?? null
}

async function nextTicketKey(supabase: Awaited<ReturnType<typeof createClient>>, tcId: string | null): Promise<string> {
  const base = tcId ? `DEV-${tcId}` : 'DEV'
  const { data } = await supabase.from('tickets').select('key').like('key', `${base}%`)
  const taken = new Set((data ?? []).map((r) => r.key as string))
  if (tcId && !taken.has(base)) return base
  for (let n = tcId ? 2 : taken.size + 1; ; n++) {
    const k = `${base}-${n}`
    if (!taken.has(k)) return k
  }
}

// ---- Test cases -------------------------------------------------------------------------

const ManualResult = z.object({
  case_id: z.uuid(),
  result: z.enum(['passed', 'failed', 'blocked']),
  note: z.string().trim().max(2000).optional(),
  build: z.string().trim().max(100).optional(),
  raise_ticket: z.string().optional(),
  severity: z.enum(['Critical', 'High', 'Medium', 'Low']).optional(),
})

export async function recordManualResult(formData: FormData) {
  const path = back(formData, '/cases')
  const me = await getMe()
  if (me.role === 'dev') fail(path, 'Only QA or the lead record manual results')
  const parsed = ManualResult.safeParse(Object.fromEntries(formData))
  if (!parsed.success) fail(path, 'Pick a result')
  const v = parsed.data
  const supabase = await createClient()
  const sprintId = await activeSprintId()
  const { error } = await supabase.from('test_runs').insert({
    case_id: v.case_id,
    kind: 'manual',
    result: v.result,
    note: v.note || null,
    build: v.build || null,
    sprint_id: sprintId,
    recorded_by: me.id,
  })
  if (error) fail(path, error.message)

  if (v.result === 'failed' && v.raise_ticket) {
    const { data: c } = await supabase.from('test_cases').select('tc_id, title, priority').eq('id', v.case_id).single()
    if (c) {
      const key = await nextTicketKey(supabase, c.tc_id)
      const { error: tErr } = await supabase.from('tickets').insert({
        key,
        case_id: v.case_id,
        title: c.title,
        description: v.note || null,
        severity: v.severity ?? c.priority,
        found_in_sprint_id: sprintId,
        current_sprint_id: await fixSprintId(),
        created_by: me.id,
      })
      if (tErr) fail(path, tErr.message)
    }
  }
  revalidatePath('/', 'layout')
  redirect(withMessage(path, 'ok', 'Result recorded'))
}

export async function setAutomation(formData: FormData) {
  const path = back(formData, '/cases')
  const me = await getMe()
  if (me.role === 'dev') fail(path, 'Only QA or the lead change automation status')
  const v = z
    .object({ case_id: z.uuid(), automation: z.enum(['not_automated', 'automated', 'manual_only']) })
    .safeParse(Object.fromEntries(formData))
  if (!v.success) fail(path, 'Pick an automation status')
  const supabase = await createClient()
  const { error } = await supabase.from('test_cases').update({ automation: v.data.automation }).eq('id', v.data.case_id)
  if (error) fail(path, error.message)
  revalidatePath('/', 'layout')
  redirect(withMessage(path, 'ok', 'Automation status saved'))
}

// ---- Tickets ----------------------------------------------------------------------------

const NewTicket = z.object({
  case_id: z.uuid().optional().or(z.literal('')),
  title: z.string().trim().min(3).max(300),
  description: z.string().trim().max(5000).optional(),
  severity: z.enum(['Critical', 'High', 'Medium', 'Low']),
  kind: z.enum(['defect', 'test_mismatch']).default('defect'),
  area_id: z.uuid().optional().or(z.literal('')),
})
/** Screenshots uploaded by the new-ticket form, under the folder it made for itself. */
const TicketFiles = z.array(z.string().regex(/^tickets\/[0-9a-f-]{36}\/[\w.-]{1,120}$/)).max(10)

export async function raiseTicket(formData: FormData) {
  const path = back(formData, '/tickets')
  const me = await getMe()
  const parsed = NewTicket.safeParse(Object.fromEntries(formData))
  if (!parsed.success) fail(path, 'A ticket needs a title and a severity')
  const files = TicketFiles.safeParse(formData.getAll('attachments'))
  if (!files.success) fail(path, 'Those screenshots could not be attached')
  const v = parsed.data
  const supabase = await createClient()
  let tcId: string | null = null
  if (v.case_id) {
    const { data } = await supabase.from('test_cases').select('tc_id').eq('id', v.case_id).single()
    tcId = data?.tc_id ?? null
  }
  const sprintId = await activeSprintId()
  const key = await nextTicketKey(supabase, tcId)
  const { error } = await supabase.from('tickets').insert({
    key: v.kind === 'test_mismatch' ? key.replace(/^DEV/, 'MM') : key,
    kind: v.kind,
    case_id: v.case_id || null,
    title: v.title,
    description: v.description || null,
    severity: v.severity,
    found_in_sprint_id: sprintId,
    current_sprint_id: await fixSprintId(),
    created_by: me.id,
    ...(v.area_id ? { area_id: v.area_id } : {}),
    ...(files.data.length ? { attachments: files.data } : {}),
  })
  if (error) fail(path, error.message)
  revalidatePath('/', 'layout')
  redirect(`/tickets/${encodeURIComponent(key)}`)
}

const Move = z.object({
  ticket_id: z.uuid(),
  to: z.enum(['new', 'triaged', 'in_fix', 'ready_for_retest', 'reopened', 'closed', 'deferred', 'duplicate']),
  fixed_in_build: z.string().trim().max(100).optional(),
  defer_reason: z.string().trim().max(1000).optional(),
  duplicate_key: z.string().trim().max(100).optional(),
  note: z.string().trim().max(2000).optional(),
})

type MoveInput = z.infer<typeof Move>

/** Moves a ticket for the signed-in person. Returns an error message, or null when it worked. */
async function applyMove(me: Awaited<ReturnType<typeof getMe>>, v: MoveInput): Promise<string | null> {
  const supabase = await createClient()
  const { data: t } = await supabase.from('tickets').select('id, state, case_id, owner_id').eq('id', v.ticket_id).single()
  if (!t) return 'Ticket not found'
  const from = t.state as TicketState
  if (!canMove(from, v.to, me.role)) return `A ${me.role} cannot move a ticket from ${from} to ${v.to}`

  const patch: Record<string, unknown> = { state: v.to }
  const need = requiredFor(v.to)
  if (need === 'fixed_in_build') {
    if (!v.fixed_in_build) return 'Say which build has the fix'
    patch.fixed_in_build = v.fixed_in_build
  }
  if (need === 'defer_reason') {
    if (!v.defer_reason) return 'Give a reason for deferring'
    patch.defer_reason = v.defer_reason
  }
  if (need === 'duplicate_of') {
    const { data: dup } = await supabase.from('tickets').select('id').eq('key', (v.duplicate_key ?? '').toUpperCase()).maybeSingle()
    if (!dup) return 'Enter the key of the ticket this duplicates'
    if (dup.id === t.id) return 'A ticket cannot duplicate itself'
    patch.duplicate_of = dup.id
  }
  // A dev who starts a fix on an unowned ticket takes it.
  if (v.to === 'in_fix' && !t.owner_id && me.role === 'dev') patch.owner_id = me.id

  const { error } = await supabase.from('tickets').update(patch).eq('id', t.id)
  if (error) return error.message

  const retest = retestResult(from, v.to)
  if (retest && t.case_id && me.role !== 'dev') {
    await supabase.from('test_runs').insert({
      case_id: t.case_id,
      kind: 'manual',
      result: retest,
      note: v.note ? `Retest: ${v.note}` : 'Retest',
      sprint_id: await activeSprintId(),
      recorded_by: me.id,
    })
  }
  return null
}

export async function moveTicket(formData: FormData) {
  const path = back(formData, '/tickets')
  const me = await getMe()
  const parsed = Move.safeParse(Object.fromEntries(formData))
  if (!parsed.success) fail(path, 'That move is not valid')
  const err = await applyMove(me, parsed.data)
  if (err) fail(path, err)
  revalidatePath('/', 'layout')
  redirect(withMessage(path, 'ok', 'Ticket updated'))
}

/** Called from the board's drag and drop. */
export async function moveTicketFromBoard(input: MoveInput): Promise<{ error?: string }> {
  const me = await getMe()
  const parsed = Move.safeParse(input)
  if (!parsed.success) return { error: 'That move is not valid' }
  const err = await applyMove(me, parsed.data)
  if (err) return { error: err }
  revalidatePath('/', 'layout')
  return {}
}

export async function updateTicket(formData: FormData) {
  const path = back(formData, '/tickets')
  await getMe()
  const v = z
    .object({
      ticket_id: z.uuid(),
      owner_id: z.uuid().or(z.literal('')),
      severity: z.enum(['Critical', 'High', 'Medium', 'Low']),
    })
    .safeParse(Object.fromEntries(formData))
  if (!v.success) fail(path, 'Pick an owner and a severity')
  const supabase = await createClient()
  const { error } = await supabase
    .from('tickets')
    .update({ owner_id: v.data.owner_id || null, severity: v.data.severity })
    .eq('id', v.data.ticket_id)
  if (error) fail(path, error.message)
  revalidatePath('/', 'layout')
  redirect(withMessage(path, 'ok', 'Saved'))
}

// ---- Sprints ----------------------------------------------------------------------------

const SprintForm = z.object({
  id: z.uuid().optional().or(z.literal('')),
  name: z.string().trim().min(1).max(40),
  starts_on: z.iso.date(),
  ends_on: z.iso.date(),
  goal: z.string().trim().max(500).optional(),
  kind: z.enum(['triage', 'test', 'fix', 'regression']).default('test'),
})

export async function saveSprint(formData: FormData) {
  const path = back(formData, '/sprints')
  const me = await getMe()
  if (me.role !== 'lead') fail(path, 'Only the lead plans sprints')
  const parsed = SprintForm.safeParse(Object.fromEntries(formData))
  if (!parsed.success) fail(path, 'A sprint needs a name and start and end dates')
  const v = parsed.data
  if (v.ends_on < v.starts_on) fail(path, 'The sprint ends before it starts')
  const areaIds = formData.getAll('area_id').map(String)
  const supabase = await createClient()
  const row = { name: v.name, kind: v.kind, starts_on: v.starts_on, ends_on: v.ends_on, goal: v.goal || null }
  const { data, error } = v.id
    ? await supabase.from('sprints').update(row).eq('id', v.id).select('id').single()
    : await supabase.from('sprints').insert(row).select('id').single()
  if (error || !data) fail(path, error?.message ?? 'Could not save the sprint')
  await supabase.from('sprint_areas').delete().eq('sprint_id', data.id)
  if (areaIds.length) {
    const { error: aErr } = await supabase
      .from('sprint_areas')
      .insert(areaIds.map((area_id) => ({ sprint_id: data.id, area_id })))
    if (aErr) fail(path, aErr.message)
  }
  revalidatePath('/', 'layout')
  redirect(withMessage(`/sprints/${data.id}`, 'ok', 'Sprint saved'))
}

export async function startSprint(formData: FormData) {
  const id = String(formData.get('sprint_id'))
  const path = `/sprints/${id}`
  const me = await getMe()
  if (me.role !== 'lead') fail(path, 'Only the lead starts a sprint')
  const supabase = await createClient()
  // Test and fix sprints run side by side; each track runs one sprint at a time.
  const all = await loadSprints()
  const me_ = all.find((s) => s.id === id)
  const other = all.find((s) => s.id !== id && s.status === 'active' && me_ && trackOf(s) === trackOf(me_))
  if (other) fail(path, `Close ${other.name} first; one ${trackOf(other) === 'dev' ? 'fix' : 'test'} sprint runs at a time`)
  const { error } = await supabase.from('sprints').update({ status: 'active' }).eq('id', id)
  if (error) fail(path, error.message)
  revalidatePath('/', 'layout')
  redirect(withMessage(path, 'ok', 'Sprint started'))
}

// ---- Plan -------------------------------------------------------------------------------

export async function setTaskStatus(formData: FormData) {
  const path = back(formData, '/plan')
  await getMe()
  const v = z
    .object({ task_id: z.uuid(), status: z.enum(['not_started', 'in_progress', 'blocked', 'done']) })
    .safeParse(Object.fromEntries(formData))
  if (!v.success) fail(path, 'Pick a status')
  const supabase = await createClient()
  const { error } = await supabase
    .from('plan_tasks')
    .update({ status: v.data.status, updated_at: new Date().toISOString() })
    .eq('id', v.data.task_id)
  if (error) fail(path, error.message)
  revalidatePath('/plan')
  redirect(path)
}

// ---- Admin ------------------------------------------------------------------------------

const PersonForm = z.object({
  id: z.uuid().optional().or(z.literal('')),
  name: z.string().trim().min(1).max(100),
  email: z.email().or(z.literal('')),
  role: z.enum(['lead', 'dev', 'qa']),
  active: z.string().optional(),
})

export async function savePerson(formData: FormData) {
  const path = '/admin'
  const me = await getMe()
  if (me.role !== 'lead') fail(path, 'Only the lead manages the team')
  const parsed = PersonForm.safeParse(Object.fromEntries(formData))
  if (!parsed.success) fail(path, 'A person needs a name, a valid email and a role')
  const v = parsed.data
  const supabase = await createClient()
  const row = { name: v.name, email: v.email ? v.email.toLowerCase() : null, role: v.role, active: v.id ? !!v.active : true }
  const { error } = v.id
    ? await supabase.from('people').update(row).eq('id', v.id)
    : await supabase.from('people').insert(row)
  if (error) fail(path, error.message)
  revalidatePath('/', 'layout')
  redirect(withMessage(path, 'ok', 'Saved'))
}

export async function createCiToken(formData: FormData) {
  const me = await getMe()
  if (me.role !== 'lead') fail('/admin?tab=ci', 'Only the lead creates CI tokens')
  const label = String(formData.get('label') ?? '').trim() || 'CI'
  const token = `vqt_${randomBytes(24).toString('base64url')}`
  const supabase = await createClient()
  // The API checks the hash; the sealed copy lets the lead reveal it again on Admin.
  const { error } = await supabase.from('ci_tokens').insert({
    label,
    token_hash: createHash('sha256').update(token).digest('hex'),
    token_enc: seal(token, 'ci-token'),
    created_by: me.id,
  })
  if (error) fail('/admin?tab=ci', error.message)
  revalidatePath('/admin')
  redirect(withMessage('/admin?tab=ci', 'ok', `Token "${label}" created`))
}

/** Admin › CI tokens: the lead reveals or copies a token. */
export async function revealCiToken(id: string): Promise<{ error?: string; token?: string }> {
  const me = await getMe()
  if (me.role !== 'lead') return { error: 'Only the lead sees CI tokens' }
  if (!z.uuid().safeParse(id).success) return { error: 'Unknown token' }
  const supabase = await createClient()
  const { data } = await supabase.from('ci_tokens').select('token_enc, revoked_at').eq('id', id).maybeSingle()
  if (!data?.token_enc) return { error: 'This token was made before tokens could be revealed. Make a new one.' }
  if (data.revoked_at) return { error: 'This token is revoked' }
  try {
    return { token: unseal(data.token_enc, 'ci-token') }
  } catch {
    return { error: 'The token could not be read' }
  }
}

export async function revokeCiToken(formData: FormData) {
  const me = await getMe()
  if (me.role !== 'lead') fail('/admin', 'Only the lead revokes CI tokens')
  const supabase = await createClient()
  const { error } = await supabase
    .from('ci_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', String(formData.get('token_id')))
  if (error) fail('/admin', error.message)
  revalidatePath('/admin')
  redirect(withMessage('/admin?tab=ci', 'ok', 'Token revoked'))
}

// ---- Workflow: comments, assignment, bulk edits from the grids ------------------------------

export async function addComment(formData: FormData) {
  const path = back(formData, '/tickets')
  const me = await getMe()
  const v = z.object({ ticket_id: z.uuid(), body: z.string().trim().min(1).max(5000) }).safeParse(Object.fromEntries(formData))
  if (!v.success) fail(path, 'Write something first')
  const supabase = await createClient()
  const { error } = await supabase.from('ticket_comments').insert({ ticket_id: v.data.ticket_id, body: v.data.body, author_id: me.id })
  if (error) fail(path, error.message)
  revalidatePath(path)
  redirect(withMessage(path, 'ok', 'Comment added'))
}

export async function assignToMe(formData: FormData) {
  const path = back(formData, '/tickets')
  const me = await getMe()
  const supabase = await createClient()
  const { error } = await supabase.from('tickets').update({ owner_id: me.id }).eq('id', String(formData.get('ticket_id')))
  if (error) fail(path, error.message)
  revalidatePath('/', 'layout')
  redirect(withMessage(path, 'ok', 'Assigned to you'))
}

const CasePatch = z.object({
  title: z.string().trim().min(3).max(300).optional(),
  priority: z.enum(['Critical', 'High', 'Medium', 'Low']).optional(),
  automation: z.enum(['not_automated', 'automated', 'manual_only']).optional(),
  area_id: z.uuid().optional(),
  tester_id: z.uuid().nullable().optional(),
})

/** Inline and bulk edits from the test cases grid. */
export async function updateCases(ids: string[], patch: z.infer<typeof CasePatch>): Promise<{ error?: string }> {
  const me = await getMe()
  if (me.role === 'dev') return { error: 'Only QA or the lead edit test cases' }
  const p = CasePatch.safeParse(patch)
  const idList = z.array(z.uuid()).min(1).max(2000).safeParse(ids)
  if (!p.success || !idList.success || !Object.keys(p.data).length) return { error: 'Nothing valid to save' }
  const supabase = await createClient()
  const { error } = await supabase.from('test_cases').update({ ...p.data, updated_at: new Date().toISOString() }).in('id', idList.data)
  if (error) return { error: error.message }
  revalidatePath('/', 'layout')
  return {}
}

/** Bulk "record result" from the test cases grid. */
export async function recordResults(ids: string[], result: 'passed' | 'failed' | 'blocked'): Promise<{ error?: string }> {
  const me = await getMe()
  if (me.role === 'dev') return { error: 'Only QA or the lead record results' }
  const idList = z.array(z.uuid()).min(1).max(500).safeParse(ids)
  if (!idList.success || !['passed', 'failed', 'blocked'].includes(result)) return { error: 'Nothing valid to save' }
  const supabase = await createClient()
  const sprintId = await activeSprintId()
  const { error } = await supabase.from('test_runs').insert(
    idList.data.map((case_id) => ({ case_id, kind: 'manual', result, sprint_id: sprintId, recorded_by: me.id })),
  )
  if (error) return { error: error.message }
  revalidatePath('/', 'layout')
  return {}
}

const TicketPatch = z.object({
  owner_id: z.uuid().nullable().optional(),
  severity: z.enum(['Critical', 'High', 'Medium', 'Low']).optional(),
  title: z.string().trim().min(3).max(300).optional(),
  current_sprint_id: z.uuid().nullable().optional(),
})

/** Inline and bulk edits from the tickets grid. The database still enforces who may change what. */
export async function updateTickets(ids: string[], patch: z.infer<typeof TicketPatch>): Promise<{ error?: string }> {
  await getMe()
  const p = TicketPatch.safeParse(patch)
  const idList = z.array(z.uuid()).min(1).max(1000).safeParse(ids)
  if (!p.success || !idList.success || !Object.keys(p.data).length) return { error: 'Nothing valid to save' }
  const supabase = await createClient()
  const { error } = await supabase.from('tickets').update(p.data).in('id', idList.data)
  if (error) return { error: error.message }
  revalidatePath('/', 'layout')
  return {}
}

// ---- Adding test cases ----------------------------------------------------------------------

export async function createTestCase(formData: FormData) {
  const path = '/cases/new'
  const me = await getMe()
  if (me.role === 'dev') fail(path, 'Only QA or the lead add test cases')
  const v = z
    .object({
      tc_id: z.string().trim().toUpperCase().regex(/^TC_[A-Z0-9_]+$/, 'IDs look like TC_FN_070').or(z.literal('')),
      area_id: z.uuid(),
      title: z.string().trim().min(3).max(300),
      priority: z.enum(['Critical', 'High', 'Medium', 'Low']),
      test_type: z.string().trim().max(50).optional(),
      preconditions: z.string().trim().max(5000).optional(),
      steps: z.string().trim().max(10000).optional(),
      test_data: z.string().trim().max(5000).optional(),
      expected: z.string().trim().max(5000).optional(),
      another: z.string().optional(),
    })
    .safeParse(Object.fromEntries(formData))
  if (!v.success) fail(path, v.error.issues[0]?.message ?? 'Check the form')
  const supabase = await createClient()
  let tcId = v.data.tc_id
  if (!tcId) {
    const { data } = await supabase.rpc('next_tc_id')
    tcId = String(data)
  }
  const { data: area } = await supabase.from('areas').select('page').eq('id', v.data.area_id).single()
  const { error } = await supabase.from('test_cases').insert({
    tc_id: tcId,
    area_id: v.data.area_id,
    source_page: area?.page ?? null,
    title: v.data.title,
    priority: v.data.priority,
    test_type: v.data.test_type || null,
    preconditions: v.data.preconditions || null,
    steps: v.data.steps || null,
    test_data: v.data.test_data || null,
    expected: v.data.expected || null,
    created_by: me.id,
  })
  if (error) fail(path, error.code === '23505' ? `${tcId} already exists` : error.message)
  revalidatePath('/', 'layout')
  if (v.data.another) redirect(withMessage(`/cases/new?area=${v.data.area_id}`, 'ok', `${tcId} added`))
  redirect(withMessage(`/cases/${tcId}`, 'ok', `${tcId} added`))
}

/** Status and sprint changes from the plan grid and the sprint's task board. Anyone on the team can move a task along. */
export async function updateTasks(ids: string[], patch: { status?: string; sprint_id?: string | null }): Promise<{ error?: string }> {
  await getMe()
  const p = z.object({
    status: z.enum(['not_started', 'in_progress', 'blocked', 'done']).optional(),
    sprint_id: z.uuid().nullable().optional(),
  }).safeParse(patch)
  const idList = z.array(z.uuid()).min(1).max(200).safeParse(ids)
  if (!p.success || !idList.success || !Object.keys(p.data).length) return { error: 'Nothing valid to save' }
  const supabase = await createClient()
  const { error } = await supabase.from('plan_tasks').update({ ...p.data, updated_at: new Date().toISOString() }).in('id', idList.data)
  if (error) return { error: error.message }
  revalidatePath('/', 'layout')
  return {}
}

const TaskInput = z.object({
  title: z.string().trim().min(3).max(300),
  phase: z.string().trim().min(1).max(40),
  owner_id: z.uuid().nullable(),
  owner_label: z.string().trim().max(120).optional(),
  due_on: z.iso.date(),
  status: z.enum(['not_started', 'in_progress', 'blocked', 'done']),
  sprint_id: z.uuid().nullable(),
  note: z.string().trim().max(2000).nullable(),
})

/**
 * Save a plan task from the sprint's task panel. Anyone on the team edits; the lead adds new
 * ones. The owner label follows the picked person, or keeps free text like "Uday with zone owners".
 */
export async function saveTask(id: string | null, input: z.infer<typeof TaskInput>): Promise<{ error?: string }> {
  const me = await getMe()
  const v = TaskInput.safeParse(input)
  if (!v.success) return { error: 'Give the task a title, a phase and a due date' }
  if (id && !z.uuid().safeParse(id).success) return { error: 'Unknown task' }
  const supabase = await createClient()
  let label = v.data.owner_label?.trim() || ''
  if (v.data.owner_id) {
    const { data: person } = await supabase.from('people').select('name').eq('id', v.data.owner_id).single()
    label = person?.name ?? label
  }
  const row = { ...v.data, owner_label: label || 'Unassigned', updated_at: new Date().toISOString() }
  if (id) {
    const { error } = await supabase.from('plan_tasks').update(row).eq('id', id)
    if (error) return { error: error.message }
  } else {
    if (me.role !== 'lead') return { error: 'Only the lead adds tasks' }
    const { data: last } = await supabase.from('plan_tasks').select('num').order('num', { ascending: false }).limit(1).maybeSingle()
    const { error } = await supabase.from('plan_tasks').insert({ ...row, num: (last?.num ?? 0) + 1 })
    if (error) return { error: error.message }
  }
  revalidatePath('/', 'layout')
  return {}
}

/** Admin › Holidays: office days off, skipped when sprint dates move. Lead only. */
export async function saveHoliday(formData: FormData) {
  const me = await getMe()
  if (me.role !== 'lead') fail('/admin?tab=holidays', 'Only the lead edits holidays')
  const v = z.object({ day: z.iso.date(), name: z.string().trim().min(2).max(80) }).safeParse(Object.fromEntries(formData))
  if (!v.success) fail('/admin?tab=holidays', 'Give a date and a name')
  const supabase = await createClient()
  const { error } = await supabase.from('holidays').upsert(v.data)
  if (error) fail('/admin?tab=holidays', error.message)
  revalidatePath('/', 'layout')
  redirect(withMessage('/admin?tab=holidays', 'ok', `${v.data.name} added`))
}

export async function removeHoliday(formData: FormData) {
  const me = await getMe()
  if (me.role !== 'lead') fail('/admin?tab=holidays', 'Only the lead edits holidays')
  const day = z.iso.date().safeParse(formData.get('day'))
  if (!day.success) fail('/admin?tab=holidays', 'Unknown holiday')
  const supabase = await createClient()
  const { error } = await supabase.from('holidays').delete().eq('day', day.data)
  if (error) fail('/admin?tab=holidays', error.message)
  revalidatePath('/', 'layout')
  redirect('/admin?tab=holidays')
}

/** Lead only: delete rows for good. The database checks the role too. */
export async function deleteRows(table: 'plan_tasks' | 'tickets' | 'test_cases', ids: string[]): Promise<{ error?: string }> {
  const me = await getMe()
  if (me.role !== 'lead') return { error: 'Only the lead deletes' }
  const idList = z.array(z.uuid()).min(1).max(2000).safeParse(ids)
  if (!idList.success || !['plan_tasks', 'tickets', 'test_cases'].includes(table)) return { error: 'Nothing to delete' }
  const supabase = await createClient()
  const { error, count } = await supabase.from(table).delete({ count: 'exact' }).in('id', idList.data)
  if (error) return { error: error.message }
  if (!count) return { error: 'Nothing was deleted' }
  revalidatePath('/', 'layout')
  return {}
}

/** Edits from the team grid on Admin. Lead only (the database enforces it too). */
export async function updatePeople(ids: string[], patch: Record<string, string | null>): Promise<{ error?: string }> {
  const me = await getMe()
  if (me.role !== 'lead') return { error: 'Only the lead manages the team' }
  const p = z
    .object({
      name: z.string().trim().min(1).max(100).optional(),
      email: z.email().transform((e) => e.toLowerCase()).nullable().optional(),
      role: z.enum(['lead', 'dev', 'qa']).optional(),
      active: z.enum(['yes', 'no']).transform((v) => v === 'yes').optional(),
    })
    .safeParse(patch)
  const idList = z.array(z.uuid()).min(1).max(200).safeParse(ids)
  if (!p.success || !idList.success) return { error: p.success ? 'Nothing to save' : (p.error.issues[0]?.message ?? 'Check the value') }
  if (idList.data.includes(me.id) && (p.data.role && p.data.role !== 'lead' || p.data.active === false)) {
    return { error: 'You cannot remove your own lead access' }
  }
  const supabase = await createClient()
  const { error } = await supabase.from('people').update(p.data).in('id', idList.data)
  if (error) return { error: error.code === '23505' ? 'That email is already on the team' : error.message }
  revalidatePath('/', 'layout')
  return {}
}

/** One manual result from a case page's header buttons. A failure can raise its ticket in the same step. */
export async function recordCaseResult(input: {
  case_id: string
  result: 'passed' | 'failed' | 'blocked'
  note?: string
  build?: string
  raise_ticket?: boolean
  /** Paths in the evidence bucket the tester uploaded with this result. */
  attachments?: string[]
}): Promise<{ error?: string; ticketKey?: string }> {
  const me = await getMe()
  if (me.role === 'dev') return { error: 'Only QA or the lead record results' }
  const v = z
    .object({
      case_id: z.uuid(),
      result: z.enum(['passed', 'failed', 'blocked']),
      note: z.string().trim().max(2000).optional(),
      build: z.string().trim().max(100).optional(),
      raise_ticket: z.boolean().optional(),
      attachments: z.array(z.string().regex(/^runs\/[0-9a-f-]{36}\/[\w.-]{1,120}$/)).max(10).optional(),
    })
    .safeParse(input)
  if (!v.success) return { error: 'That result is not valid' }
  if (v.data.attachments?.some((p) => !p.startsWith(`runs/${v.data.case_id}/`))) return { error: 'Those files belong to another case' }
  const supabase = await createClient()
  const sprintId = await activeSprintId()
  const { error } = await supabase.from('test_runs').insert({
    case_id: v.data.case_id, kind: 'manual', result: v.data.result, note: v.data.note || null, build: v.data.build || null,
    sprint_id: sprintId, recorded_by: me.id, attachments: v.data.attachments ?? [],
  })
  if (error) return { error: error.message }
  let ticketKey: string | undefined
  if (v.data.result === 'failed' && v.data.raise_ticket) {
    const { data: c } = await supabase.from('test_cases').select('tc_id, title, priority').eq('id', v.data.case_id).single()
    if (c) {
      const { data: open } = await supabase.from('tickets').select('key').eq('case_id', v.data.case_id)
        .in('state', ['new', 'triaged', 'in_fix', 'reopened', 'ready_for_retest']).limit(1)
      if (open?.length) ticketKey = open[0].key // already tracked; don't open a second ticket
      else {
        ticketKey = await nextTicketKey(supabase, c.tc_id)
        const { error: tErr } = await supabase.from('tickets').insert({
          key: ticketKey, case_id: v.data.case_id, title: c.title, description: v.data.note || null, severity: c.priority,
          found_in_sprint_id: sprintId, current_sprint_id: await fixSprintId(), created_by: me.id,
        })
        if (tErr) return { error: `Result saved, but the ticket was not: ${tErr.message}` }
      }
    }
  }
  revalidatePath('/', 'layout')
  return { ticketKey }
}

// ---- Sprint board: detail panel and comments without leaving the board ----------------------

export type CaseDetail = {
  case: { id: string; tc_id: string; title: string; priority: string; automation: string; tester_id: string | null; preconditions: string | null; steps: string | null; test_data: string | null; expected: string | null; zone: string; page: string }
  ticket: { id: string; key: string; title: string; state: string; severity: string; owner_id: string | null; current_sprint_id: string | null; fixed_in_build: string | null } | null
  runs: { kind: string; result: string; recorded_at: string; note: string | null; who: string | null; files: { name: string; url: string }[] }[]
  comments: { body: string; created_at: string; who: string | null }[]
}

/** Everything the board's side panel shows for one case: a given ticket of it, else its latest open one. */
export async function getCaseDetail(caseId: string, ticketId?: string | null): Promise<CaseDetail | { error: string }> {
  await getMe()
  if (!z.uuid().safeParse(caseId).success) return { error: 'Unknown test case' }
  const pick = ticketId && z.uuid().safeParse(ticketId).success ? ticketId : null
  const supabase = await createClient()
  const ticketQuery = pick
    ? supabase.from('tickets').select('id, key, title, state, severity, owner_id, current_sprint_id, fixed_in_build').eq('id', pick).eq('case_id', caseId).maybeSingle()
    : supabase.from('tickets').select('id, key, title, state, severity, owner_id, current_sprint_id, fixed_in_build')
      .eq('case_id', caseId).in('state', ['new', 'triaged', 'in_fix', 'reopened', 'ready_for_retest']).order('logged_on', { ascending: false }).limit(1).maybeSingle()
  const [{ data: c }, { data: t }, { data: runs }] = await Promise.all([
    supabase.from('test_cases').select('id, tc_id, title, priority, automation, tester_id, preconditions, steps, test_data, expected, areas(zone, page)').eq('id', caseId).single(),
    ticketQuery,
    supabase.from('test_runs').select('kind, result, recorded_at, note, attachments, people(name)').eq('case_id', caseId).order('recorded_at', { ascending: false }).limit(6),
  ])
  if (!c) return { error: 'Test case not found' }
  const area = c.areas as unknown as { zone: string; page: string } | null
  // Screenshots: short-lived links, so files stay private to the team.
  const paths = (runs ?? []).flatMap((r) => (r.attachments as string[] | null) ?? [])
  const signed = new Map<string, string>()
  if (paths.length) {
    const { data: links } = await supabase.storage.from('evidence').createSignedUrls(paths, 3600)
    for (const l of links ?? []) if (l.signedUrl && l.path) signed.set(l.path, l.signedUrl)
  }
  const { data: comments } = t
    ? await supabase.from('ticket_comments').select('body, created_at, people(name)').eq('ticket_id', t.id).order('created_at', { ascending: false }).limit(10)
    : { data: [] }
  return {
    case: { ...c, zone: area?.zone ?? '', page: area?.page ?? '' } as CaseDetail['case'],
    ticket: (t as CaseDetail['ticket']) ?? null,
    runs: (runs ?? []).map((r) => ({
      kind: r.kind, result: r.result, recorded_at: r.recorded_at, note: r.note, who: (r.people as unknown as { name: string } | null)?.name ?? null,
      files: ((r.attachments as string[] | null) ?? []).map((p) => ({ name: p.split('/').pop()!.replace(/^[0-9a-f-]{36}-/, ''), url: signed.get(p) ?? '' })).filter((f) => f.url),
    })),
    comments: (comments ?? []).map((m) => ({ body: m.body, created_at: m.created_at, who: (m.people as unknown as { name: string } | null)?.name ?? null })),
  }
}

/** A comment from the side panel. */
export async function addTicketComment(ticketId: string, body: string): Promise<{ error?: string }> {
  const me = await getMe()
  const v = z.object({ ticketId: z.uuid(), body: z.string().trim().min(1).max(5000) }).safeParse({ ticketId, body })
  if (!v.success) return { error: 'Write something first' }
  const supabase = await createClient()
  const { error } = await supabase.from('ticket_comments').insert({ ticket_id: v.data.ticketId, body: v.data.body, author_id: me.id })
  if (error) return { error: error.message }
  revalidatePath('/', 'layout')
  return {}
}
