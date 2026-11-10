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
 * PATCH /api/asks/{key}: answer it, mark a need provided (with store: where the secret was put),
 * decide (outcome: retire, rewrite, restore or other), change its owner or due date, or add and
 * remove cases. A decision's outcome takes effect when it is marked decided.
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
