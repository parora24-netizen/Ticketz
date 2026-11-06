-- Tickets for cases whose latest automated run failed, that have a manual result and no ticket yet,
-- so those failures are tracked. Raised as the API would: by CI, on the case's priority, in the page's
-- open fix sprint, described from the latest run; a mismatch if the latest manual test passed, else
-- a defect. A known_defect result is left alone.
insert into tickets (key, kind, case_id, title, description, severity, found_in_sprint_id, current_sprint_id, created_by)
select
  next_ticket_key(case when f.manual_result = 'passed' then 'MM' else 'DEV' end),
  (case when f.manual_result = 'passed' then 'test_mismatch' else 'defect' end)::ticket_kind,
  f.id, f.title,
  concat_ws(E'\n',
    case when f.manual_result = 'passed' then 'Type I – False positive' end,
    'Error: ' || f.note, 'Build ' || f.build || coalesce(', run ' || f.run_id, ''), 'Report: ' || f.url),
  f.priority,
  (select id from sprints where status = 'active' order by starts_on limit 1),
  (select s.id from sprint_areas sa join sprints s on s.id = sa.sprint_id
   where sa.area_id = f.area_id and s.kind = 'fix' and s.status <> 'closed' order by s.starts_on limit 1),
  (select id from people where email = 'ci@launchpad.invalid')
from (
  select c.id, c.title, c.priority, c.area_id, r.note, r.build, r.run_id, r.url, m.result as manual_result
  from test_cases c
  join lateral (
    select * from test_runs x where x.case_id = c.id and x.kind = 'auto' order by x.recorded_at desc limit 1
  ) r on r.result = 'failed'
  join lateral (
    select * from test_runs x where x.case_id = c.id and x.kind = 'manual' order by x.recorded_at desc limit 1
  ) m on true
  where not exists (select 1 from tickets t where t.case_id = c.id)
  order by substring(c.tc_id from 4)::int
) f;
