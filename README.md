# Vulqan 26.111 Tracker

Plans and tracks the 26.111 release: sprints of 2–4 working days over the Framework areas of the test
workbook, and every test case through **automate → automated run → manual test → fix → retest → close**.

Next.js on Vercel, Postgres and email sign-in on Supabase.

## How the work flows

| Stage | Who | What happens |
|---|---|---|
| Automate | QA (Erik) | Mark each case Automated or Manual only on its page. |
| Automated run | CI | The suite posts results to `/api/results`. A case with results becomes Automated. |
| Manual test | QA (Uday) | Pass / Fail / Blocked on the sprint board or the case page. A Fail raises a ticket. |
| Fix | Lead, Dev | Lead triages and assigns. Dev starts the fix, then marks it fixed with the build number. |
| Retest | QA | Retest passed closes the ticket and records a pass; retest failed reopens it. |
| Close | Lead | The sprint closes when its gate is met; open Medium/Low tickets carry into the next sprint. |

Ticket moves are allowed per role (`src/lib/workflow/ticket-machine.ts`) and enforced again in the
database (`ticket_transitions` + the `tickets_guard` trigger). Critical/High cases must be tested again
inside their sprint; Medium/Low may rely on an earlier result.

## Setup

1. `npm install`
2. Copy `.env.example` to `.env.local` and fill in the Supabase keys (Project settings → API keys),
   `LEAD_EMAIL` (your sign-in email) and `SUPABASE_DB_PASSWORD`.
3. Apply the schema: `npx supabase login`, then
   `npx supabase link --project-ref ykuirkfdvgbafkbzmabk` and `npx supabase db push`.
4. Seed from the workbook: `npm run import -- "C:/Users/<you>/Downloads/26.111 Release Test Cases.xlsx"`
5. Supabase → Authentication → URL configuration: set Site URL to the app URL and add
   `http://localhost:3000/**` and `https://<vercel-domain>/**` to Redirect URLs.
6. `npm run dev`, sign in with `LEAD_EMAIL`, then add the team's emails under **Admin**.

Only people listed under Admin can sign in, and only with an address on `ALLOWED_EMAIL_DOMAINS`.

## Posting automated results (for CI)

Create a token under **Admin → CI tokens** and store it as a CI secret. After each run:

```bash
curl -X POST "$TRACKER_URL/api/results" \
  -H "Authorization: Bearer $TRACKER_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "build": "b39a5eab1",
    "run_id": "codebuild-1234",
    "results": [
      { "tc_id": "TC_FN_070", "status": "passed", "duration_ms": 5400 },
      { "tc_id": "TC_FN_071", "status": "failed", "error": "Expected error text not shown", "url": "https://reports.example/1234#TC_FN_071" },
      { "tc_id": "TC_FN_072", "status": "skipped" },
      { "tc_id": "TC_FN_073", "status": "known_defect" }
    ]
  }'
```

`status` is `passed`, `failed`, `skipped` or `known_defect`. Up to 5,000 results per call; a test reported
twice keeps its last result. The response lists `recorded`, the `sprint` they landed in, and any
`unmatched` ids that are not in the tracker. Results go into the running sprint.

## Development

- `npm test` runs the workflow, sprint-gate and API payload tests.
- `npm run typecheck`
- Migrations live in `supabase/migrations/`.
