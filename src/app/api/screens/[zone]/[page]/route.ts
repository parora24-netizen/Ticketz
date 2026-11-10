import { NextResponse, type NextRequest } from 'next/server'
import { authenticate } from '@/lib/ci-api'
import { ScreenHold } from '@/lib/automation-loop'
import { ticketId } from '@/lib/asks-server'
import { audit, isDryRun } from '@/lib/automation-server'

/**
 * PUT /api/screens/{zone}/{page}: hold a screen for automation, e.g. while D219 is open. Body:
 * { defect?: ticket key, reason?, until?: YYYY-MM-DD }; the hold lifts when the defect closes or
 * the date passes. An empty body (or all nulls) lifts it now.
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ zone: string; page: string }> }) {
  const caller = await authenticate(request)
  if (caller instanceof NextResponse) return caller
  const p = ScreenHold.safeParse((await request.json().catch(() => null)) ?? {})
  if (!p.success) return NextResponse.json({ error: 'Invalid payload', issues: p.error.issues.slice(0, 10) }, { status: 400 })
  const { zone, page } = await params
  const { data: areas } = await caller.db.from('areas').select('id, zone, page').ilike('zone', decodeURIComponent(zone)).ilike('page', decodeURIComponent(page))
  if (areas?.length !== 1) return NextResponse.json({ error: `No page ${decodeURIComponent(zone)} · ${decodeURIComponent(page)}` }, { status: 404 })
  const ticket = p.data.defect ? await ticketId(caller.db, p.data.defect) : null
  if (p.data.defect && !ticket) return NextResponse.json({ error: `No ticket ${p.data.defect}` }, { status: 404 })
  const hold = { automation_hold_ticket_id: ticket, automation_hold_reason: p.data.reason ?? null, automation_hold_until: p.data.until ?? null }
  const lifting = !ticket && !hold.automation_hold_reason && !hold.automation_hold_until
  if (isDryRun(request)) return NextResponse.json({ zone: areas[0].zone, page: areas[0].page, hold: lifting ? null : p.data, dry_run: true })
  const { error } = await caller.db.from('areas').update(hold).eq('id', areas[0].id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await audit(caller, request, `${lifting ? 'Lifted the hold on' : 'Held'} ${areas[0].zone} · ${areas[0].page}`, p.data)
  return NextResponse.json({ zone: areas[0].zone, page: areas[0].page, hold: lifting ? null : p.data })
}
