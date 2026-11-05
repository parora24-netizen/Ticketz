import { z } from 'zod'
import { applyProposal } from '@/lib/assistant/actions'
import { getMe } from '@/lib/auth'

const Body = z.object({ action: z.string(), input: z.unknown(), fingerprint: z.string() })

/** The person clicked Confirm on something the assistant proposed. */
export async function POST(request: Request) {
  const me = await getMe()
  const parsed = Body.safeParse(await request.json().catch(() => null))
  if (!parsed.success) return Response.json({ error: 'That was not understood' }, { status: 400 })
  try {
    return Response.json(await applyProposal(parsed.data.action, parsed.data.input, parsed.data.fingerprint, me))
  } catch (e) {
    return Response.json({ error: `It could not be done: ${(e as Error).message}` })
  }
}
