import { NextResponse, type NextRequest } from 'next/server'
import { authenticate } from '@/lib/ci-api'
import { PrUpsert } from '@/lib/automation-loop'
import { prJson, upsertPr } from '@/lib/prs-server'

/** GET /api/prs?state=open: the automation pull requests, oldest first, with their cases and age. */
export async function GET(request: NextRequest) {
  const caller = await authenticate(request)
  if (caller instanceof NextResponse) return caller
  let q = caller.db.from('automation_prs').select('*, pr_cases(test_cases(tc_id)), reviewer:people(name)').order('opened_at')
  const state = request.nextUrl.searchParams.get('state')
  if (state) q = q.eq('state', state)
  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ prs: (data ?? []).map(prJson) })
}

/** POST /api/prs: report a pull request, or update the one with that key. Body as PATCH /api/prs/{key}, with key. */
export async function POST(request: NextRequest) {
  const caller = await authenticate(request)
  if (caller instanceof NextResponse) return caller
  const p = PrUpsert.safeParse(await request.json().catch(() => null))
  if (!p.success || !p.data.key) return NextResponse.json({ error: 'Invalid payload; key is required', issues: p.success ? [] : p.error.issues.slice(0, 10) }, { status: 400 })
  return upsertPr(caller, request, p.data.key, p.data)
}

