-- Workflow features: ticket comments, task owners, an activity log for Home and Standup,
-- and auto-numbered test case ids.

-- Comments on tickets ------------------------------------------------------------------------
create table ticket_comments (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references tickets on delete cascade,
  author_id uuid not null references people,
  body text not null check (length(trim(body)) between 1 and 5000),
  created_at timestamptz not null default now(),
  edited_at timestamptz
);
create index ticket_comments_ticket on ticket_comments (ticket_id, created_at);
alter table ticket_comments enable row level security;
create policy read_comments on ticket_comments for select using (is_member());
create policy write_own_comment on ticket_comments for insert with check (author_id = current_person_id());
create policy edit_own_comment on ticket_comments for update using (author_id = current_person_id())
  with check (author_id = current_person_id());

-- Who a plan task belongs to (owner_label stays as written in the plan) ----------------------
alter table plan_tasks add column owner_id uuid references people;
update plan_tasks t set owner_id = p.id
from people p
where t.owner_id is null and split_part(split_part(t.owner_label, ',', 1), ' ', 1) = p.name;

create table plan_task_events (
  id bigint generated always as identity primary key,
  task_id uuid not null references plan_tasks on delete cascade,
  from_status task_status,
  to_status task_status not null,
  actor_id uuid references people,
  at timestamptz not null default now()
);
alter table plan_task_events enable row level security;
create policy read_task_events on plan_task_events for select using (is_member());

create function plan_tasks_log() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status then
    insert into plan_task_events (task_id, from_status, to_status, actor_id)
    values (new.id, old.status, new.status, current_person_id());
  end if;
  return new;
end $$;
create trigger plan_tasks_log after update on plan_tasks
for each row execute function plan_tasks_log();

-- Test case authorship -----------------------------------------------------------------------
alter table test_cases add column created_by uuid references people;
alter table test_cases add column updated_at timestamptz not null default now();

/** The next free TC_FN_ number, for the new-test-case form. */
create function next_tc_id() returns text
language sql stable as $$
  select 'TC_FN_' || lpad((coalesce(max((regexp_match(tc_id, '^TC_FN_(\d+)$'))[1]::int), 0) + 1)::text, 3, '0')
  from test_cases
$$;

-- Activity: one stream of who did what, for Home "Since yesterday" and Standup "Yesterday" ----
create view activity with (security_invoker = on) as
select
  'ticket'::text as kind, e.at, e.actor_id,
  t.owner_id as subject_owner_id,
  t.key as ref, t.title,
  case
    when e.from_state is null then 'opened'
    when e.from_state = e.to_state then coalesce(e.note, 'updated')
    else e.from_state::text || ' → ' || e.to_state::text
  end as what,
  e.to_state::text as detail
from ticket_events e join tickets t on t.id = e.ticket_id
union all
select
  'comment', c.created_at, c.author_id, t.owner_id, t.key, t.title, 'commented', left(c.body, 200)
from ticket_comments c join tickets t on t.id = c.ticket_id
union all
select
  'result', r.recorded_at, r.recorded_by, null, tc.tc_id, tc.title, 'manual ' || r.result::text, r.note
from test_runs r join test_cases tc on tc.id = r.case_id
where r.kind = 'manual' and r.recorded_by is not null
union all
select
  'case', tc.created_at, tc.created_by, null, tc.tc_id, tc.title, 'added test case', null
from test_cases tc where tc.created_by is not null
union all
select
  'task', ev.at, ev.actor_id, pt.owner_id, '#' || pt.num, pt.title,
  coalesce(ev.from_status::text, '') || ' → ' || ev.to_status::text, ev.to_status::text
from plan_task_events ev join plan_tasks pt on pt.id = ev.task_id;
