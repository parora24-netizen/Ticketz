import { NextResponse, type NextRequest } from 'next/server'
import { authenticate } from '@/lib/ci-api'
import { PrUpsert } from '@/lib/automation-loop'
import { upsertPr } from '@/lib/prs-server'

/**
 * PATCH /api/prs/{key}: a pull request's state (open, merged, closed), url, title, author, reviewer
 * and cases (the whole list). merged_at defaults to now when it is marked merged. The cases turn
 * automated when their next automated result comes in, as for any case.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const caller = await authenticate(request)
  if (caller instanceof NextResponse) return caller
  const p = PrUpsert.safeParse(await request.json().catch(() => null))
  if (!p.success) return NextResponse.json({ error: 'Invalid payload', issues: p.error.issues.slice(0, 10) }, { status: 400 })
  return upsertPr(caller, request, decodeURIComponent((await params).key), p.data)
}
