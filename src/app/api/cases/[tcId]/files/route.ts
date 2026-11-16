import { NextResponse, type NextRequest } from 'next/server'
import { authenticate } from '@/lib/ci-api'
import { CASE_FILES_BUCKET } from '@/lib/case-files'
import { casesByAnyId } from '@/lib/ids'

const LINK_SECONDS = 3600

/**
 * GET /api/cases/{tc_id}/files: the files kept on a test case (datasets, inputs, screenshots), oldest
 * first, each with a download link that works for an hour. Fetch the link without the token.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ tcId: string }> }) {
  const caller = await authenticate(request)
  if (caller instanceof NextResponse) return caller
  const asked = decodeURIComponent((await params).tcId).toUpperCase()
  const c = (await casesByAnyId(caller.db, [asked])).get(asked)
  if (!c) return NextResponse.json({ error: `No test case ${asked}` }, { status: 404 })
  const { data, error } = await caller.db.from('case_files').select('path, name, size_bytes, content_type, created_at, people(name)').eq('case_id', c.id).order('created_at')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const files = await Promise.all((data ?? []).map(async (f) => {
    const { data: link } = await caller.db.storage.from(CASE_FILES_BUCKET).createSignedUrl(f.path, LINK_SECONDS, { download: f.name })
    return {
      name: f.name, size_bytes: Number(f.size_bytes), content_type: f.content_type, uploaded_at: f.created_at,
      uploaded_by: (f.people as unknown as { name: string } | null)?.name ?? null, url: link?.signedUrl ?? null,
    }
  }))
  return NextResponse.json({ tc_id: c.tc_id, link_expires_in: LINK_SECONDS, files })
}
