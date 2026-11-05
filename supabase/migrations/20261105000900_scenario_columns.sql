-- The test cases grid shows each case's scenario and requirement, so the view carries them.
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
  c.requirement_id
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

-- Data Exporter's IDs, from the release workbook's Test Scenarios sheet, which never reached the
-- cases. Its ranges use the old IDs. Only blanks are filled.
update test_cases c
set scenario_id = v.scenario_id, requirement_id = v.requirement_id
from (values
  ('TS_FN_35', 'REQ_FN_35', 5000, 5039),
  ('TS_FN_36', 'REQ_FN_36', 5040, 5072),
  ('TS_FN_37', 'REQ_FN_37', 5073, 5104),
  ('TS_FN_38', 'REQ_FN_38', 5105, 5140)
) as v(scenario_id, requirement_id, first_n, last_n)
where c.legacy_tc_id ~ '^TC_FN_[0-9]+$'
  and substring(c.legacy_tc_id from 7)::int between v.first_n and v.last_n
  and c.scenario_id is null and c.requirement_id is null;
