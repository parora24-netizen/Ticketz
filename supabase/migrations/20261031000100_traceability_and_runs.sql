-- Cases carry the workbook's traceability (scenario and requirement ids), automated results remember
-- the token that posted them, and ci_runs reads each posted run back as one row.

alter table test_cases add column scenario_id text check (length(scenario_id) <= 100);
alter table test_cases add column requirement_id text check (length(requirement_id) <= 100);
create index test_cases_scenario on test_cases (scenario_id) where scenario_id is not null;
create index test_cases_requirement on test_cases (requirement_id) where requirement_id is not null;

alter table test_runs add column ci_token_id uuid references ci_tokens on delete set null;
create index test_runs_run on test_runs (run_id) where run_id is not null;

create view ci_runs with (security_invoker = on) as
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
  max(p.name) as posted_by
from test_runs r
left join sprints s on s.id = r.sprint_id
left join ci_tokens t on t.id = r.ci_token_id
left join people p on p.id = t.created_by
where r.kind = 'auto' and r.run_id is not null
group by r.run_id;
