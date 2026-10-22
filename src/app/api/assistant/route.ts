import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'
import { getMe } from '@/lib/auth'
import { TOOLS, runTool, toolLabel } from '@/lib/assistant/tools'

// Answers can take a few lookups; streaming keeps the connection busy meanwhile.
export const maxDuration = 120

const MODEL = 'claude-opus-5-5'
const MAX_STEPS = 8

// Fixed, so it is cached across questions; who is asking and today's date come after it.
const SYSTEM = `You are the assistant inside Launchpad, the tracker for the Vulqan 26.111 release. You answer the team's questions about test cases, tickets, sprints and people, using the read-only tools. You cannot change anything; if asked to, say where in the app to do it.

How the release runs:
- Test cases belong to areas (zone · page, e.g. "Engine · Sign-On"). Each has a priority, an automation status, a tester, and its latest automated and manual results.
- Tickets: DEV- keys are product defects; MM- keys are mismatches, where the automated test and the manual test disagree (usually the automated test needs fixing). States: new (not started), triaged, in_fix, ready_for_retest, reopened, closed, deferred, duplicate. A ticket can also be flagged blocked, with a reason.
- Sprints run on two tracks side by side: test sprints (T1-T4: write, automate and run the cases of their areas) and fix sprints (F1-F6: fix tickets; each takes what the previous test sprint found). S0 was triage, R1 is regression. Go/no-go is 3 Dec, release 4 Dec 2026.

Answering:
- Look things up rather than guess; use counts for "how many" questions and searches for lists. Say when a list is cut short (the tools return a total).
- Be brief and concrete. Lead with the answer, then the detail. Use short bullet lists for several items.
- Link what you mention with markdown links: tickets as [DEV-TC_FN_074](/tickets/DEV-TC_FN_074), test cases as [TC_FN_070](/cases/TC_FN_070), sprints as [T1](/sprints/T1).
- Dates in the data are in India time. Say "not started" for state new and "ready for retest" for ready_for_retest.`

const Body = z.object({
  messages: z.array(z.object({ role: z.enum(['user', 'assistant']), text: z.string().max(8000) })).min(1).max(40),
})

const line = (o: unknown) => JSON.stringify(o) + '\n'

/** The in-app assistant: one question in, a streamed answer out (newline-delimited JSON events). */
export async function POST(request: Request) {
  const me = await getMe()
  if (!process.env.ANTHROPIC_API_KEY) return Response.json({ error: 'The assistant is not set up yet: the API key is missing.' }, { status: 503 })
  const parsed = Body.safeParse(await request.json().catch(() => null))
  if (!parsed.success || parsed.data.messages.at(-1)?.role !== 'user') return Response.json({ error: 'Ask a question' }, { status: 400 })

  const today = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Asia/Kolkata' })
  const role = { lead: 'the lead', dev: 'a developer', qa: 'a tester (QA)' }[me.role]
  // Earlier turns are plain text; the newest user message is last.
  const messages: Anthropic.Beta.BetaMessageParam[] = parsed.data.messages.slice(-20).map((m) => ({ role: m.role, content: m.text }))

  const client = new Anthropic()
  const tools = TOOLS.map((t) => t.tool)
  const ctx = {}

  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enc = new TextEncoder()
      const send = (o: unknown) => controller.enqueue(enc.encode(line(o)))
      try {
        for (let step = 0; step < MAX_STEPS; step++) {
          const stream = client.beta.messages.stream({
            model: MODEL,
            max_tokens: 16000,
            betas: ['server-side-fallback-2026-07-01'],
            fallbacks: 'default',
            output_config: { effort: 'medium' },
            system: [
              { type: 'text', text: SYSTEM, cache_control: { type: 'ephemeral' } },
              { type: 'text', text: `Today is ${today}. You are talking to ${me.name}, ${role}.` },
            ],
            tools,
            messages,
          })
          stream.on('text', (delta) => send({ t: 'text', d: delta }))
          const message = await stream.finalMessage()

          if (message.stop_reason === 'refusal') { send({ t: 'text', d: '\n\nI can’t help with that one.' }); break }
          if (message.stop_reason === 'pause_turn') { messages.push({ role: 'assistant', content: message.content }); continue }
          const uses = message.content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === 'tool_use')
          if (!uses.length) break
          if (message.stop_reason === 'max_tokens') { send({ t: 'text', d: '\n\n(The answer was cut short.)' }); break }

          messages.push({ role: 'assistant', content: message.content })
          const results: Anthropic.Beta.BetaToolResultBlockParam[] = []
          for (const u of uses) {
            send({ t: 'tool', label: toolLabel(u.name) })
            const r = await runTool(u.name, u.input, ctx)
            results.push({ type: 'tool_result', tool_use_id: u.id, content: r.content, is_error: r.isError || undefined })
          }
          messages.push({ role: 'user', content: results })
          if (step === MAX_STEPS - 1) send({ t: 'text', d: '\n\n(I stopped after several lookups; try a narrower question.)' })
        }
        send({ t: 'done' })
      } catch (e) {
        const message = e instanceof Anthropic.RateLimitError ? 'The assistant is busy; try again in a moment.'
          : e instanceof Anthropic.AuthenticationError ? 'The assistant’s API key was refused.'
          : e instanceof Anthropic.APIError ? `The assistant hit an error (${e.status ?? 'network'}).`
          : 'The assistant hit an error.'
        send({ t: 'error', message })
      } finally {
        controller.close()
      }
    },
  })
  return new Response(body, { headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-store' } })
}
