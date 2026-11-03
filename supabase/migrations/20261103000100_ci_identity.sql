-- The API acts as "CI", not as whoever made the token: tickets it raises, its comments and its runs
-- read as CI. CI is not a sign-in account (the address cannot receive mail) and, being inactive,
-- stays out of team lists, owner pickers and @mentions.

insert into people (name, email, role, active) values ('CI', 'ci@launchpad.invalid', 'qa', false)
on conflict do nothing;

-- Runs read as posted by CI; the token's own name stays in the token column.
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
  case when count(r.ci_token_id) > 0 then 'CI' end as posted_by
from test_runs r
left join sprints s on s.id = r.sprint_id
left join ci_tokens t on t.id = r.ci_token_id
where r.kind = 'auto' and r.run_id is not null
group by r.run_id;

-- What the API did before today, credited to CI. Every automated run since the workbook baseline
-- came through the one token in use ("CI e2e suite"; the other was revoked unused).
update test_runs set ci_token_id = (select id from ci_tokens where label = 'CI e2e suite' and revoked_at is null limit 1)
where kind = 'auto' and run_id is distinct from 'workbook-baseline' and ci_token_id is null;

-- Only the API sets defect_id, so those are the tickets it raised.
update tickets set created_by = (select id from people where email = 'ci@launchpad.invalid')
where defect_id is not null;
update ticket_events set actor_id = (select id from people where email = 'ci@launchpad.invalid')
where from_state is null and actor_id is null
  and ticket_id in (select id from tickets where defect_id is not null);

-- Its comments were marked "CI: " under the token maker's name.
update ticket_comments set author_id = (select id from people where email = 'ci@launchpad.invalid'), body = substr(body, 5)
where body like 'CI: %';
update case_comments set author_id = (select id from people where email = 'ci@launchpad.invalid'), body = substr(body, 5)
where body like 'CI: %';
