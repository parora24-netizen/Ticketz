-- Retired test cases: kept, with their history, but out of the release. A retired case is not in
-- case_latest, so it leaves every list, board, count and the release status; the runner is told not to
-- run it. Its page still opens (by its ID or from search), and the lead or QA can restore it.
alter table test_cases
  add column if not exists retired_at timestamptz,
  add column if not exists retired_by uuid references people(id),
  add column if not exists retired_reason text check (char_length(retired_reason) <= 2000);

create index if not exists test_cases_retired on test_cases (retired_at) where retired_at is not null;

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
) lm on true
where c.retired_at is null;
