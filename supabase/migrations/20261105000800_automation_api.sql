-- What the automation team needs from the API: a writable automation state per case, a signal for
-- when a case's text changed, tokens with a role, and a named runner to post as.
alter type automation_status add value if not exists 'in_progress';
alter type automation_status add value if not exists 'blocked';

alter table test_cases
  add column automation_note text check (length(automation_note) <= 2000),
  add column automation_owner text check (length(automation_owner) <= 200),
  add column automation_ref text check (length(automation_ref) <= 500),
  add column revision int not null default 1,
  add column text_updated_at timestamptz not null default now();

-- Where the change log knows when the text last changed, use that; otherwise when the case was made.
-- Triggers are off so this backfill is not itself recorded as an edit.
alter table test_cases disable trigger user;
update test_cases c set text_updated_at = coalesce(
  (select max(l.at) from change_log l
   where l.table_name = 'test_cases' and l.row_id = c.id and l.action = 'update'
     and l.changes ?| array['title', 'preconditions', 'steps', 'test_data', 'expected']),
  c.created_at);
alter table test_cases enable trigger user;

-- updated_at moves on any change, including a result flipping automation. These move only when a
-- tester changes what the case says, so an automated test can tell it has gone stale.
create function touch_case_text() returns trigger language plpgsql as $$
begin
  if (new.title, new.preconditions, new.steps, new.test_data, new.expected)
     is distinct from (old.title, old.preconditions, old.steps, old.test_data, old.expected) then
    new.revision := old.revision + 1;
    new.text_updated_at := now();
  end if;
  return new;
end $$;
create trigger test_cases_text before update on test_cases for each row execute function touch_case_text();
create index test_cases_text_updated_at on test_cases (text_updated_at);

-- A runner token may set automation fields; a tester token, one acting as a person, may not.
alter table ci_tokens add column role text not null default 'runner' check (role in ('runner', 'tester'));
update ci_tokens set role = 'tester' where person_id is not null;

-- The box posts as itself. Like CI it cannot sign in and, being inactive, stays out of team lists.
insert into people (name, email, role, active) values ('e2e tests runner', 'runner@launchpad.invalid', 'qa', false)
on conflict do nothing;

-- Runs read as posted by the token's person, else CI.
create or replace view ci_runs with (security_invoker = on) as
select
  r.run_id,
  max(r.build) as build,
  min(r.recorded_at) as posted_at,
  count(*)::int as results,
  (count(*) filter (where r.result = 'passed'))::int as passed,
  (count(*) filter (where r.result = 'failed'))::int as failed,
  (count(*) filter (where r.result = 'skipped'))::int as skipped,
  (count(*) filter (where r.result = 'known_defect'))::int as known_defect,
  max(s.name) as sprint,
  max(t.label) as token,
  case when count(r.ci_token_id) > 0 then coalesce(max(tp.name), 'CI') end as posted_by
from test_runs r
left join sprints s on s.id = r.sprint_id
left join ci_tokens t on t.id = r.ci_token_id
left join people tp on tp.id = t.person_id
where r.kind = 'auto' and r.run_id is not null
group by r.run_id;
