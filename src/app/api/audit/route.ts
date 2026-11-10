import { NextResponse, type NextRequest } from 'next/server'
import { authenticate } from '@/lib/ci-api'

/**
 * GET /api/audit?since=<ISO time>&token=<label>&limit=: what tokens changed through the API, newest
 * first: case automation fields, asks, pull requests, screen holds, results posted and retests closed.
 */
export async function GET(request: NextRequest) {
  const caller = await authenticate(request)
  if (caller instanceof NextResponse) return caller
  const q = request.nextUrl.searchParams
  let query = caller.db.from('api_log').select('method, path, summary, details, at, ci_tokens(label)').order('at', { ascending: false }).limit(Math.min(Number(q.get('limit')) || 200, 1000))
  if (q.get('since')) query = query.gte('at', q.get('since')!)
  if (q.get('token')) {
    const { data: tok } = await caller.db.from('ci_tokens').select('id').eq('label', q.get('token')!).maybeSingle()
    if (!tok) return NextResponse.json({ error: `No token labelled ${q.get('token')}` }, { status: 404 })
    query = query.eq('token_id', tok.id)
  }
  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({
    entries: (data ?? []).map(({ ci_tokens, ...e }) => ({ token: ((Array.isArray(ci_tokens) ? ci_tokens[0] : ci_tokens) as { label: string } | null)?.label ?? null, ...e })),
  })
}
