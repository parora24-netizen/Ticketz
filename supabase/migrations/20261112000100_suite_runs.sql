-- A full run of the automated suite as something to open and drill into: its lifecycle, phases,
-- environment counters, per-test telemetry on each result, and the waits the suite measured.

create table suite_runs (
  id uuid primary key default gen_random_uuid(),
  run_id text not null unique check (length(run_id) between 1 and 200),
  kind text not null default 'full' check (kind in ('full', 'batch', 'probe')),
  target text check (length(target) <= 100),
  branch text check (length(branch) <= 200),
  commit text check (length(commit) <= 100),
  bundle text check (length(bundle) <= 200),
  bundle_end text check (length(bundle_end) <= 200),
  workers int,
  tests_planned int,
  tests_done int,
  passed int,
  failed int,
  known_defect int,
  not_tested int,
  launcher text check (length(launcher) <= 200),
  started_at timestamptz not null default now(),
  eta timestamptz,
  finished_at timestamptz,
  exit text check (exit in ('finished', 'killed', 'gave_up', 'refused')),
  confounded boolean not null default false,  -- the frontend bundle changed mid-run
  wall_min numeric,
  worker_min numeric,
  creates_failed int,
  rate_limit_waits int,
  http_503 int,
  lock_wait_min numeric,
  token_id uuid references ci_tokens on delete set null,
  updated_at timestamptz not null default now()
);
create index suite_runs_started on suite_runs (started_at desc);

create table run_phases (
  id bigint generated always as identity primary key,
  run_id text not null references suite_runs (run_id) on delete cascade on update cascade,
  phase text not null check (length(phase) between 1 and 60),
  at timestamptz not null,
  duration_s numeric,
  outcome text not null check (outcome in ('ok', 'failed', 'cut', 'skipped')),
  detail text check (length(detail) <= 2000)
);
create index run_phases_run on run_phases (run_id, at);

-- How long a test waited at each site: the landing settling, an engine opening, a toast…
create table run_waits (
  id bigint generated always as identity primary key,
  run_id text not null references suite_runs (run_id) on delete cascade on update cascade,
  case_id uuid references test_cases on delete cascade,
  site text not null check (length(site) between 1 and 60),
  ms int not null check (ms >= 0),
  outcome text check (length(outcome) <= 30)
);
create index run_waits_run on run_waits (run_id, site);

-- Per-test telemetry on each automated result.
alter table test_runs
  add column spec_file text check (length(spec_file) <= 500),
  add column test_title text check (length(test_title) <= 500),
  add column tags text[],
  add column started_at timestamptz,
  add column worker int,
  add column retries int,
  add column outcome text check (outcome in ('passed', 'failed', 'known_defect', 'not_tested', 'timed_out', 'interrupted')),
  add column not_tested_reason text check (length(not_tested_reason) <= 1000),
  add column error_head text check (length(error_head) <= 1000),
  add column fixture_engine text check (length(fixture_engine) <= 200),
  add column artifacts jsonb;
create index test_runs_run_id on test_runs (run_id) where run_id is not null;

alter table suite_runs enable row level security;
alter table run_phases enable row level security;
alter table run_waits enable row level security;
create policy suite_runs_read on suite_runs for select using ((select is_member()));
create policy run_phases_read on run_phases for select using ((select is_member()));
create policy run_waits_read on run_waits for select using ((select is_member()));
