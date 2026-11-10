import { NextResponse, type NextRequest } from 'next/server'
import { authenticate } from '@/lib/ci-api'
import { CaseAutomation } from '@/lib/automation-loop'
import { applyCaseAutomation, audit, isDryRun } from '@/lib/automation-server'

/**
 * PATCH /api/cases/{tc_id}: a case's automation state, and nothing else; testers keep the text.
 * Body (any of): automation_status (not_automated, in_progress, automated, blocked), automation_note,
 * automation_owner, automation_ref, automation_block (a code) and automation_block_ticket (a key),
 * automation_proposed ("not_automatable", for a lead to approve) with automation_proposed_reason,
 * and revision: the case's revision you worked from (or an If-Match header). If someone has changed
 * the case's text since, nothing changes and the answer is 409. ?dry_run=true says what would change.
 * Auth: a runner token.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ tcId: string }> }) {
  const caller = await authenticate(request)
  if (caller instanceof NextResponse) return caller
  if (caller.role !== 'runner') return NextResponse.json({ error: 'This token cannot change automation fields; use a runner token' }, { status: 403 })
  const body = await request.json().catch(() => null)
  const ifMatch = Number(request.headers.get('if-match')?.replace(/"/g, ''))
  const p = CaseAutomation.safeParse(body && Number.isInteger(ifMatch) && ifMatch > 0 ? { revision: ifMatch, ...body } : body)
  if (!p.success) return NextResponse.json({ error: 'Invalid payload. "not_automatable" is proposed with automation_proposed, for a lead to approve.', issues: p.error.issues.slice(0, 10) }, { status: 400 })
  if (Object.keys(p.data).filter((k) => k !== 'revision').length === 0) return NextResponse.json({ error: 'Send at least one automation field' }, { status: 400 })
  const tc_id = decodeURIComponent((await params).tcId).toUpperCase()
  const dry = isDryRun(request)
  const [res] = await applyCaseAutomation(caller, [{ ...p.data, tc_id }], dry)
  if (res.status === 'not_found') return NextResponse.json({ error: `No test case ${tc_id}` }, { status: 404 })
  if (res.status === 'conflict') return NextResponse.json(res, { status: 409 })
  if (res.status === 'error') return NextResponse.json(res, { status: 400 })
  if (res.status === 'updated') await audit(caller, request, `Set ${Object.keys(res.changes ?? {}).join(', ')} on ${res.tc_id}`, res.changes)
  return NextResponse.json(res)
}
