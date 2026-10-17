-- Vulqan 26.111 tracker: core schema.
-- Areas come from the test workbook's Framework tab; sprints are scoped to areas;
-- every test case moves automate -> automated run -> manual test -> fix -> retest -> close.

create type person_role as enum ('lead', 'dev', 'qa');
create type priority as enum ('Critical', 'High', 'Medium', 'Low');
create type sprint_status as enum ('planned', 'active', 'closed');
create type automation_status as enum ('not_automated', 'automated', 'manual_only');
create type run_kind as enum ('auto', 'manual');
-- auto: passed | failed | skipped | known_defect ; manual: passed | failed | blocked
create type run_result as enum ('passed', 'failed', 'skipped', 'known_defect', 'blocked');
create type ticket_kind as enum ('defect', 'test_mismatch');
create type ticket_state as enum (
  'new', 'triaged', 'in_fix', 'ready_for_retest', 'reopened', 'closed', 'deferred', 'duplicate'
);
create type task_status as enum ('not_started', 'in_progress', 'blocked', 'done');

create table people (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text unique,
  role person_role not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index people_email_lower on people (lower(email));

create table areas (
  id uuid primary key default gen_random_uuid(),
  zone text not null,
  page text not null,
  sort int not null,
  unique (zone, page)
);

create table sprints (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  starts_on date not null,
  ends_on date not null,
  status sprint_status not null default 'planned',
  goal text,
  closed_at timestamptz,
  check (ends_on >= starts_on)
);

create table sprint_areas (
  sprint_id uuid not null references sprints on delete cascade,
  area_id uuid not null references areas on delete cascade,
  primary key (sprint_id, area_id)
);

create table test_cases (
  id uuid primary key default gen_random_uuid(),
  tc_id text not null unique,            -- e.g. TC_FN_070, matches the @TC_ tags in the automated suite
  area_id uuid not null references areas,
  source_page text,                      -- page as written in the workbook, e.g. Create-Database
  title text not null,
  preconditions text,
  steps text,
  test_data text,
  expected text,
  priority priority not null,
  test_type text,
  automation automation_status not null default 'not_automated',
  created_at timestamptz not null default now()
);
create index test_cases_area on test_cases (area_id);

create table test_runs (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references test_cases on delete cascade,
  sprint_id uuid references sprints,     -- null = baseline imported from the workbook
  kind run_kind not null,
  result run_result not null,
  build text,
  run_id text,
  note text,
  url text,
  duration_ms int,
  recorded_by uuid references people,
  recorded_at timestamptz not null default now(),
  check (kind = 'auto' or result in ('passed', 'failed', 'blocked')),
  check (kind = 'manual' or result in ('passed', 'failed', 'skipped', 'known_defect'))
);
create index test_runs_case on test_runs (case_id, kind, recorded_at desc);
create index test_runs_sprint on test_runs (sprint_id);

create table tickets (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,              -- DEV-TC_FN_070 / MM-TC_E2E_032 / DEV-<n>
  kind ticket_kind not null default 'defect',
  case_id uuid references test_cases,
  title text not null,
  description text,
  severity priority not null,
  state ticket_state not null default 'new',
  owner_id uuid references people,
  found_in_sprint_id uuid references sprints,
  current_sprint_id uuid references sprints,
  fixed_in_build text,
  defer_reason text,
  duplicate_of uuid references tickets,
  logged_on date not null default current_date,
  created_by uuid references people,
  updated_at timestamptz not null default now()
);
create index tickets_state on tickets (state);
create index tickets_case on tickets (case_id);

create table ticket_events (
  id bigint generated always as identity primary key,
  ticket_id uuid not null references tickets on delete cascade,
  from_state ticket_state,
  to_state ticket_state,
  note text,
  actor_id uuid references people,
  at timestamptz not null default now()
);
create index ticket_events_ticket on ticket_events (ticket_id, at);

-- Who may move a ticket from one state to another. Mirrors src/lib/workflow/ticket-machine.ts;
-- a unit test checks the two stay identical.
create table ticket_transitions (
  from_state ticket_state not null,
  to_state ticket_state not null,
  role person_role not null,
  primary key (from_state, to_state, role)
);
insert into ticket_transitions (from_state, to_state, role) values
  ('new', 'triaged', 'lead'), ('new', 'triaged', 'qa'),
  ('new', 'in_fix', 'lead'), ('new', 'in_fix', 'dev'),
  ('triaged', 'in_fix', 'lead'), ('triaged', 'in_fix', 'dev'),
  ('in_fix', 'ready_for_retest', 'lead'), ('in_fix', 'ready_for_retest', 'dev'),
  ('reopened', 'in_fix', 'lead'), ('reopened', 'in_fix', 'dev'),
  ('ready_for_retest', 'closed', 'lead'), ('ready_for_retest', 'closed', 'qa'),
  ('ready_for_retest', 'reopened', 'lead'), ('ready_for_retest', 'reopened', 'qa'),
  ('closed', 'reopened', 'lead'), ('closed', 'reopened', 'qa'),
  ('deferred', 'triaged', 'lead'),
  ('new', 'deferred', 'lead'), ('triaged', 'deferred', 'lead'), ('in_fix', 'deferred', 'lead'),
  ('reopened', 'deferred', 'lead'), ('ready_for_retest', 'deferred', 'lead'),
  ('new', 'duplicate', 'lead'), ('new', 'duplicate', 'qa'),
  ('triaged', 'duplicate', 'lead'), ('triaged', 'duplicate', 'qa');

create table plan_tasks (
  id uuid primary key default gen_random_uuid(),
  num int not null unique,
  phase text not null,
  title text not null,
  owner_label text not null,
  due_on date not null,
  status task_status not null default 'not_started',
  note text,
  updated_at timestamptz not null default now()
);

create table ci_tokens (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  token_hash text not null unique,       -- sha256 hex of the token; the token itself is shown once
  created_by uuid references people,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
