import { NextResponse, type NextRequest } from 'next/server'
import { authenticate } from '@/lib/ci-api'
import { AskPatch } from '@/lib/automation-loop'
import { askJson, patchAsk, type AskRow } from '@/lib/asks-server'
import { audit, isDryRun } from '@/lib/automation-server'

/** GET /api/asks/{key}: one ask, with its cases. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const caller = await authenticate(request)
  if (caller instanceof NextResponse) return caller
  const key = decodeURIComponent((await params).key).toUpperCase()
  const { data } = await caller.db.from('asks').select('*').eq('key', key).maybeSingle()
  if (!data) return NextResponse.json({ error: `No ask ${key}` }, { status: 404 })
  return NextResponse.json((await askJson(caller.db, [data as AskRow]))[0])
}

/**
 * PATCH /api/asks/{key}: answer it with one outcome (state: edited, deferred, retired, manual, access,
 * replied, or duplicate with duplicate_of, which also closes it; answer says why; store is where a
 * secret was put); close an answered ask (state: closed) or send it back (state: open, with comment:
 * why), both for whoever raised it or the lead; hand it to the suite's owner (suite: what the suite
 * cannot do yet); change its owner or due date; add and remove cases. deferred, retired, manual and
 * duplicate act on the cases when it is answered.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const caller = await authenticate(request)
  if (caller instanceof NextResponse) return caller
  const p = AskPatch.safeParse(await request.json().catch(() => null))
  if (!p.success) return NextResponse.json({ error: 'Invalid payload', issues: p.error.issues.slice(0, 10) }, { status: 400 })
  const key = decodeURIComponent((await params).key)
  const res = await patchAsk(caller.db, key, p.data, { personId: caller.actorId, tokenId: caller.tokenId }, isDryRun(request))
  if ('error' in res) return NextResponse.json({ error: res.error }, { status: res.status })
  if (!('dry_run' in res)) await audit(caller, request, `Changed ${res.key}: ${Object.keys(p.data).join(', ')}`, p.data)
  return NextResponse.json(res)
}
