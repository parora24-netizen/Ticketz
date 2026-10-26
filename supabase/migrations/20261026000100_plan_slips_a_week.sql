-- Running behind: the plan moves a week. T1 and F1 run on to 30 Oct; every later sprint starts
-- five working days later (24 Nov is a holiday); T2 tests Data Hub only, and Quality Queue and
-- Delivery Station get their own test sprint, T5, whose finds F6 fixes. The release moves a week.

update sprints set starts_on = v.s::date, ends_on = v.e::date
from (values
  ('T1', '2026-10-21', '2026-10-30'), ('F1', '2026-10-21', '2026-10-30'),
  ('T2', '2026-11-02', '2026-11-04'), ('F2', '2026-11-02', '2026-11-04'),
  ('T3', '2026-11-05', '2026-11-09'), ('F3', '2026-11-05', '2026-11-09'),
  ('T4', '2026-11-10', '2026-11-12'), ('F4', '2026-11-10', '2026-11-12'),
  ('F5', '2026-11-13', '2026-11-20'), ('F6', '2026-11-23', '2026-11-30'),
  ('R1', '2026-12-01', '2026-12-04')
) as v(name, s, e)
where sprints.name = v.name and sprints.status <> 'closed';

insert into sprints (name, kind, starts_on, ends_on, goal)
values ('T5', 'test', '2026-11-13', '2026-11-17', 'Test Quality Queue and Delivery Station');

-- T2 keeps Data Hub; Quality Queue and Delivery Station move to T5.
update sprint_areas set sprint_id = (select id from sprints where name = 'T5')
where sprint_id = (select id from sprints where name = 'T2')
  and area_id in (select id from areas where zone in ('Quality Queue', 'Delivery Station'));

update sprints set goal = v.goal
from (values
  ('T2', 'Test Data Hub'),
  ('F3', 'Fix what T2 (Data Hub) found'),
  ('F6', 'Fix what T5 (Quality Queue, Delivery Station) found, and leftovers')
) as v(name, goal)
where sprints.name = v.name and sprints.status <> 'closed';

-- Medium and Low tickets follow their page's test sprint to the fix sprint after it (T5 -> F6).
update tickets t set current_sprint_id = f.id
from test_cases c
join sprint_areas sa on sa.area_id = c.area_id
join sprints ts on ts.id = sa.sprint_id and ts.kind = 'test'
join sprints f on f.name = 'F' || (substring(ts.name from 2)::int + 1)
where t.case_id = c.id
  and t.state not in ('closed', 'deferred', 'duplicate') and t.severity not in ('Critical', 'High')
  and t.current_sprint_id is distinct from f.id
  and (t.current_sprint_id is null or t.current_sprint_id in (select id from sprints where status = 'planned'));

update release_settings set release_on = '2026-12-11', go_no_go_on = '2026-12-10', updated_at = now() where id = 1;

insert into schedule_changes (kind, sprint_id, summary, reason, details, actor_id)
values (
  'shift_release',
  (select id from sprints where name = 'T2'),
  'Plan moved a week: T1 and F1 run to 30 Oct, later sprints start five working days later, T2 is Data Hub only, new T5 for Quality Queue and Delivery Station; release 11 Dec (go/no-go 10 Dec).',
  'Running behind.',
  jsonb_build_object('days', 5, 'added', 'T5', 'release_on', '2026-12-11'),
  (select id from people where lower(email) = 'parikshit.arora@vulqan.ai')
);
