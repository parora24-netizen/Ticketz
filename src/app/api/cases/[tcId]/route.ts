import { NextResponse, type NextRequest } from 'next/server'
import { authenticate } from '@/lib/ci-api'
import { casesByAnyId } from '@/lib/ids'
import { AutomationPatch, automationFromDb, automationToDb } from '@/lib/tickets-api'

/**
 * PATCH /api/cases/{tc_id}: a case's automation state, and nothing else; testers keep the text.
 * Body (any of): automation_status, automation_note, automation_owner, automation_ref.
 * Auth: a runner token.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ tcId: string }> }) {
  const caller = await authenticate(request)
  if (caller instanceof NextResponse) return caller
  if (caller.role !== 'runner') return NextResponse.json({ error: 'This token cannot change automation fields; use a runner token' }, { status: 403 })
  const p = AutomationPatch.safeParse(await request.json().catch(() => null))
  if (!p.success) return NextResponse.json({ error: 'Invalid payload', issues: p.error.issues.slice(0, 10) }, { status: 400 })
  const asked = decodeURIComponent((await params).tcId).toUpperCase()
  const found = (await casesByAnyId(caller.db, [asked])).get(asked)
  if (!found) return NextResponse.json({ error: `No test case ${asked}` }, { status: 404 })
  const { automation_status, ...fields } = p.data
  const { data, error } = await caller.db.from('test_cases')
    .update({ ...fields, ...(automation_status ? { automation: automationToDb(automation_status) } : {}) })
    .eq('id', found.id)
    .select('tc_id, automation, automation_note, automation_owner, automation_ref, updated_at')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const { automation, ...rest } = data
  return NextResponse.json({ ...rest, automation_status: automationFromDb(automation) })
}
