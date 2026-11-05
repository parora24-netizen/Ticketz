-- Tickets for cases whose latest automated run failed, with no manual result and no ticket yet, so
-- those failures are tracked. Raised as the API would: by CI, on the case's priority, in the page's
-- open fix sprint, described from the latest run.
insert into tickets (key, kind, case_id, title, description, severity, found_in_sprint_id, current_sprint_id, created_by)
select
  'DEV-' || c.tc_id, 'defect', c.id, c.title,
  concat_ws(E'\n', 'Error: ' || r.note, 'Build ' || r.build || coalesce(', run ' || r.run_id, ''), 'Report: ' || r.url),
  c.priority,
  (select id from sprints where status = 'active' order by starts_on limit 1),
  (select s.id from sprint_areas sa join sprints s on s.id = sa.sprint_id
   where sa.area_id = c.area_id and s.kind = 'fix' and s.status <> 'closed' order by s.starts_on limit 1),
  (select id from people where email = 'ci@launchpad.invalid')
from test_cases c
join lateral (
  select * from test_runs x where x.case_id = c.id and x.kind = 'auto' order by x.recorded_at desc limit 1
) r on r.result = 'failed'
where not exists (select 1 from test_runs m where m.case_id = c.id and m.kind = 'manual')
  and not exists (select 1 from tickets t where t.case_id = c.id);
