import { NextResponse } from 'next/server'
import { SCOPES } from '@/lib/ci-api'
import { CHANGE_FIELDS, CREATE_FIELDS } from '@/lib/tickets-schema'
import { TICKET_STATES, TRANSITIONS } from '@/lib/workflow/ticket-machine'

/** GET /api/reference: every route, its fields, the enums and the limits. No token needed. */
export function GET() {
  return NextResponse.json({
    auth: 'Authorization: Bearer <token from Admin > CI tokens>. GET /api/me says which token, who it acts as and its scopes.',
    scopes: { all: SCOPES, runner_default: ['read', 'create', 'comment', 'automation'], person_default: ['read', 'create', 'update', 'assign', 'comment'] },
    enums: {
      ticket_kind: ['defect', 'test_mismatch', 'task'], ticket_state: TICKET_STATES, severity: ['Critical', 'High', 'Medium', 'Low'],
      transitions: TRANSITIONS, automation_status: ['not_automated', 'in_progress', 'automated', 'blocked'],
      automation_block: ['needs_write', 'needs_server', 'needs_account', 'needs_mailbox', 'needs_text', 'control_gone', 'screen_hold', 'other'],
      ask_kind: ['need', 'question', 'decision'], ask_state: ['open (requested)', 'done (provided, answered, decided)', 'declined'],
    },
    limits: { comment_body: 5000, ticket_description: 10000, title: 300, bulk_tickets: 200, bulk_cases: 500, results_per_post: 5000 },
    notes: [
      'Unknown fields answer 400 naming the accepted ones. Add ?dry_run=true to a write to see what it would do.',
      'Ticket state changes follow the app\'s rules for the token\'s person (runners move as QA); a refused move answers 409 with the allowed ones.',
      'Every change is recorded as made by the token\'s person.',
      'A ticket\'s sprint: the one sent, else its page\'s sprint, else none.',
      'external_ref is your own id for a ticket, unique per token: posting it again updates that ticket.',
    ],
    routes: [
      { route: 'GET /api/tickets', scope: 'read', query: ['state', 'kind', 'owner', 'accountable', 'created_by', 'area', 'sprint', 'severity', 'tc_id', 'defect_id', 'external_ref', 'updated_since', 'limit'] },
      { route: 'POST /api/tickets', scope: 'create', body: 'one ticket or an array of up to 200', fields: CREATE_FIELDS },
      { route: 'PATCH /api/tickets', scope: 'update (assign for owner/accountable only)', body: '{ keys, set } or { tickets: [{ key, ... }] }' },
      { route: 'GET /api/tickets/{key}', scope: 'read', returns: 'the ticket, history and comments' },
      { route: 'PATCH /api/tickets/{key}', scope: 'update (assign for owner/accountable only)', fields: CHANGE_FIELDS },
      { route: 'POST /api/tickets/{key}/comments', scope: 'comment', fields: ['body'] },
      { route: 'POST /api/tickets/{key}/retest', scope: 'create', fields: ['result', 'build', 'run_id', 'note', 'url'] },
      { route: 'POST /api/tickets/{key}/cancel', scope: 'create', fields: ['reason'], note: 'only for tickets this token or its person raised' },
      { route: 'GET /api/cases', scope: 'read' }, { route: 'PATCH /api/cases', scope: 'automation' }, { route: 'PATCH /api/cases/{tc_id}', scope: 'automation' },
      { route: 'POST /api/cases/{tc_id}/comments', scope: 'comment' },
      { route: 'POST /api/results', scope: 'create' }, { route: 'GET /api/results', scope: 'read' }, { route: 'GET /api/runs', scope: 'read' },
      { route: 'GET|POST /api/asks', scope: 'read|create' }, { route: 'GET|PATCH /api/asks/{key}', scope: 'read|update' },
      { route: 'GET /api/events', scope: 'read', query: ['since', 'limit'] },
      { route: 'GET|POST /api/prs', scope: 'read|create' }, { route: 'PATCH /api/prs/{key}', scope: 'update' },
      { route: 'GET /api/screens', scope: 'read' }, { route: 'PUT /api/screens/{zone}/{page}', scope: 'update' },
      { route: 'GET /api/runner', scope: 'read' }, { route: 'POST /api/runner/heartbeat', scope: 'automation' }, { route: 'POST /api/runner/events', scope: 'automation' },
      { route: 'GET /api/inbox', scope: 'read', query: ['owner'] }, { route: 'GET /api/audit', scope: 'read' },
      { route: 'GET /api/team', scope: 'read' }, { route: 'GET /api/me', scope: 'read' }, { route: 'GET /api/reference', scope: 'none' },
    ],
  })
}
