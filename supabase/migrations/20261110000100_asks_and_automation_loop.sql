-- The automation loop, so anything a person must do is asked, tracked and answered in Launchpad.
-- Asks are separate from tickets: needs (a server, an account), questions and decisions, each with an
-- owner, a due date and the cases waiting on it. Tickets stay bugs, so release numbers stay true.

-- Asks ---------------------------------------------------------------------------------------------
create table asks (
  id uuid primary key default gen_random_uuid(),
  num int generated always as identity unique,
  key text unique,
  kind text not null check (kind in ('need', 'question', 'decision')),
  title text not null check (length(trim(title)) between 3 and 300),
  detail text check (length(detail) <= 5000),
  need_key text check (length(need_key) <= 200),          -- e.g. server.mssql: one open need per key
  store text check (length(store) <= 200),                -- where the secret was put, never the secret
  options text[],                                         -- a decision's choices
  owner_id uuid references people on delete set null,
  due_on date,
  state text not null default 'open' check (state in ('open', 'done', 'declined')),
  answer text check (length(answer) <= 5000),
  outcome text check (outcome in ('retire', 'rewrite', 'restore', 'other')),
  ticket_id uuid references tickets on delete set null,  -- a decision's defect, to restore
  created_by uuid references people on delete set null,
  created_via uuid references ci_tokens on delete set null,
  resolved_by uuid references people on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index asks_open_need on asks (need_key) where kind = 'need' and state = 'open' and need_key is not null;
create index asks_owner on asks (owner_id, state);

create function asks_before() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then new.key := 'ASK-' || new.num; end if;
  new.updated_at := now();
  if tg_op = 'UPDATE' and new.state is distinct from old.state then
    new.resolved_at := case when new.state = 'open' then null else now() end;
    new.resolved_by := case when new.state = 'open' then null else coalesce(current_person_id(), new.resolved_by) end;
  end if;
  return new;
end $$;
create trigger asks_before before insert or update on asks for each row execute function asks_before();

create table ask_cases (
  ask_id uuid not null references asks on delete cascade,
  case_id uuid not null references test_cases on delete cascade,
  primary key (ask_id, case_id)
);
create index ask_cases_case on ask_cases (case_id);

alter table asks enable row level security;
alter table ask_cases enable row level security;
create policy asks_read on asks for select using ((select is_member()));
create policy asks_write on asks for insert with check ((select is_member()));
create policy asks_update on asks for update using ((select is_member()));
create policy asks_delete on asks for delete using ((select has_role('{lead}')));
create policy ask_cases_read on ask_cases for select using ((select is_member()));
create policy ask_cases_write on ask_cases for insert with check ((select is_member()));
create policy ask_cases_delete on ask_cases for delete using ((select is_member()));

-- Why a case is blocked, in a form a runner can act on, and a "not automatable" for a lead to approve.
alter table test_cases
  add column automation_block text check (automation_block in ('needs_write', 'needs_server', 'needs_account', 'needs_mailbox', 'needs_text', 'control_gone', 'screen_hold', 'other')),
  add column automation_block_ticket_id uuid,  -- a ticket; no foreign key, so joins between tickets and cases stay unambiguous
  add column automation_proposed text check (automation_proposed = 'not_automatable'),
  add column automation_proposed_reason text check (length(automation_proposed_reason) <= 2000),
  add column automation_proposed_at timestamptz,
  add column automation_decided_by uuid references people on delete set null,
  add column automation_decided_at timestamptz;

-- An Expected result that is a placeholder ("Works as per design. Detailed cases to be added") is no
-- spec to automate against: the case is flagged until its writer completes it.
create function is_placeholder(t text) returns boolean language sql immutable as $$
  select t is null or btrim(t) = ''
    or lower(t) ~ '\m(to be (added|created|updated|confirmed|decided|provided)|tbd|tba)\M'
    or (length(btrim(t)) <= 60 and lower(t) ~ 'as per (the )?(design|dev)')
$$;
alter table test_cases add column needs_detail boolean generated always as (is_placeholder(expected)) stored;

-- A screen the runner should leave alone while a defect is open, e.g. one held by D219.
alter table areas
  add column automation_hold_ticket_id uuid,   -- a ticket; no foreign key, as above
  add column automation_hold_reason text check (length(automation_hold_reason) <= 500),
  add column automation_hold_until date;

-- Pull requests ------------------------------------------------------------------------------------
create table automation_prs (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (length(key) between 1 and 200),  -- e.g. e2e#123
  url text check (length(url) <= 500),
  title text check (length(title) <= 300),
  state text not null default 'open' check (state in ('open', 'merged', 'closed')),
  author text check (length(author) <= 200),
  reviewer_id uuid references people on delete set null,
  opened_at timestamptz not null default now(),
  merged_at timestamptz,
  closed_at timestamptz,
  created_via uuid references ci_tokens on delete set null,
  updated_at timestamptz not null default now()
);
create table pr_cases (
  pr_id uuid not null references automation_prs on delete cascade,
  case_id uuid not null references test_cases on delete cascade,
  primary key (pr_id, case_id)
);
alter table automation_prs enable row level security;
alter table pr_cases enable row level security;
create policy prs_read on automation_prs for select using ((select is_member()));
create policy prs_lead on automation_prs for update using ((select has_role('{lead}')));
create policy pr_cases_read on pr_cases for select using ((select is_member()));

-- The runner ---------------------------------------------------------------------------------------
create table runner_status (
  token_id uuid primary key references ci_tokens on delete cascade,
  state text not null check (state in ('idle', 'batching', 'paused_limit', 'cluster_down')),
  batch text check (length(batch) <= 200),
  backlog int,
  since timestamptz,
  heartbeat_at timestamptz not null default now()
);
create table runner_events (
  id bigint generated always as identity primary key,
  token_id uuid references ci_tokens on delete cascade,
  kind text not null check (kind in ('batch_started', 'batch_finished', 'batch_failed')),
  batch text check (length(batch) <= 200),
  detail text check (length(detail) <= 2000),
  at timestamptz not null default now()
);
create index runner_events_at on runner_events (at desc);
alter table runner_status enable row level security;
alter table runner_events enable row level security;
create policy runner_status_read on runner_status for select using ((select is_member()));
create policy runner_events_read on runner_events for select using ((select is_member()));

-- What each token changed through the API, for GET /api/audit.
create table api_log (
  id bigint generated always as identity primary key,
  token_id uuid references ci_tokens on delete set null,
  method text not null,
  path text not null,
  summary text not null,
  details jsonb,
  at timestamptz not null default now()
);
create index api_log_at on api_log (at desc);
alter table api_log enable row level security;
create policy api_log_lead on api_log for select using ((select has_role('{lead}')));

-- The change feed reads the change log, so these tables are logged too.
create trigger asks_change_log after insert or update or delete on asks for each row execute function log_change();
create trigger automation_prs_change_log after insert or update or delete on automation_prs for each row execute function log_change();
create trigger areas_change_log after update on areas for each row execute function log_change();

-- Notifications: an ask given to you, and an answer to an ask you raised.
alter table notifications add column ask_id uuid references asks on delete cascade;
alter table notifications drop constraint notifications_kind_check;
alter table notifications add constraint notifications_kind_check check (kind in ('assigned', 'mention', 'comment', 'state', 'ask', 'ask_answered'));

create function notify_ask() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  actor uuid := current_person_id();
begin
  if new.owner_id is not null and new.owner_id is distinct from actor
     and (tg_op = 'INSERT' or new.owner_id is distinct from old.owner_id)
     and exists (select 1 from people where id = new.owner_id and active) then
    insert into notifications (person_id, kind, ask_id, actor_id, detail) values (new.owner_id, 'ask', new.id, actor, new.title);
  end if;
  if tg_op = 'UPDATE' and new.state <> 'open' and old.state = 'open' and new.created_by is not null
     and new.created_by is distinct from actor and exists (select 1 from people where id = new.created_by and active) then
    insert into notifications (person_id, kind, ask_id, actor_id, detail) values (new.created_by, 'ask_answered', new.id, actor, coalesce(new.answer, new.title));
  end if;
  return null;
end $$;
create trigger asks_notify after insert or update on asks for each row execute function notify_ask();

-- The test cases grid and links can filter on what blocks a case and on placeholder text.
create or replace view case_latest with (security_invoker = on) as
select
  c.id, c.tc_id, c.title, c.priority, c.automation, c.area_id, c.source_page,
  a.zone, a.page, a.sort as area_sort,
  la.result as auto_result, la.recorded_at as auto_at, la.sprint_id as auto_sprint_id,
  lm.result as manual_result, lm.recorded_at as manual_at, lm.sprint_id as manual_sprint_id,
  (select count(*) from tickets t
    where t.case_id = c.id and t.state in ('new', 'triaged', 'in_fix', 'reopened'))::int as open_fix,
  (select count(*) from tickets t
    where t.case_id = c.id and t.state = 'ready_for_retest')::int as awaiting_retest,
  c.tester_id,
  tp.name as tester_name,
  c.legacy_tc_id,
  c.scenario_id,
  c.requirement_id,
  c.needs_detail,
  c.automation_block
from test_cases c
join areas a on a.id = c.area_id
left join people tp on tp.id = c.tester_id
left join lateral (
  select r.result, r.recorded_at, r.sprint_id from test_runs r
  where r.case_id = c.id and r.kind = 'auto' order by r.recorded_at desc limit 1
) la on true
left join lateral (
  select r.result, r.recorded_at, r.sprint_id from test_runs r
  where r.case_id = c.id and r.kind = 'manual' order by r.recorded_at desc limit 1
) lm on true;
