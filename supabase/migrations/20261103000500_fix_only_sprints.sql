-- Sprints become fix-only weeks. Test cases are written by Fri 7 Nov; each page is tested
-- (automation and by hand, tracked on Test cases > Progress) the week before its sprint fixes it.
--   S0  3–7 Nov    triage and plan
--   S1  10–14 Nov  My Flow + Landing
--   S2  17–21 Nov  Engine
--   S3  24–28 Nov  Data Importer + Data Hub
--   S4  1–5 Dec    Logic Builder + Logic Store
--   S5  8–12 Dec   Data Exporter, and what carries over
--   S6  15–19 Dec  regression; go/no-go 18 Dec, release 19 Dec
-- T1 and F1 close as history (T1 holds the results so far). The planned test sprints, F2–F6 and R1 go.

update sprints set status = 'closed' where name in ('T1', 'F1');
update sprints set starts_on = '2026-11-03', ends_on = '2026-11-07', status = 'active',
  goal = 'Triage what is open and plan the fix sprints; every test case written by Friday'
where name = 'S0';

insert into sprints (name, kind, starts_on, ends_on, status, goal) values
  ('S1', 'fix', '2026-11-10', '2026-11-14', 'planned', 'Fix My Flow and Landing'),
  ('S2', 'fix', '2026-11-17', '2026-11-21', 'planned', 'Fix Engine'),
  ('S3', 'fix', '2026-11-24', '2026-11-28', 'planned', 'Fix Data Importer and Data Hub'),
  ('S4', 'fix', '2026-12-01', '2026-12-05', 'planned', 'Fix Logic Builder and Logic Store'),
  ('S5', 'fix', '2026-12-08', '2026-12-12', 'planned', 'Fix Data Exporter, and what carries over'),
  ('S6', 'regression', '2026-12-15', '2026-12-19', 'planned', 'Regression across every page; go/no-go 18 Dec, release 19 Dec');

-- Which pages each sprint fixes, by zone; S6 covers every page in the release.
insert into sprint_areas (sprint_id, area_id)
select s.id, a.id from sprints s join areas a on a.in_release is not false and (
     (s.name = 'S1' and a.zone in ('My Flow', 'Landing'))
  or (s.name = 'S2' and a.zone = 'Engine')
  or (s.name = 'S3' and a.zone in ('Data Importer', 'Data Hub'))
  or (s.name = 'S4' and a.zone in ('Logic Builder', 'Logic Store'))
  or (s.name = 'S5' and a.zone = 'Data Exporter')
  or s.name = 'S6')
where s.name in ('S1', 'S2', 'S3', 'S4', 'S5', 'S6')
on conflict do nothing;

-- Testing is due the Friday before a page's fix sprint.
update areas a set automate_due_on = s.starts_on - 3
from sprint_areas sa join sprints s on s.id = sa.sprint_id and s.kind = 'fix' and s.name in ('S1', 'S2', 'S3', 'S4', 'S5')
where sa.area_id = a.id;

-- Open tickets go to their page's sprint (no page: S1); closed ones left on retiring sprints rest in F1.
with page as (
  select t.id, coalesce(t.area_id, c.area_id) as area_id
  from tickets t left join test_cases c on c.id = t.case_id
  where t.state in ('new', 'triaged', 'in_fix', 'reopened', 'ready_for_retest')
)
update tickets t set current_sprint_id = coalesce(
  (select s.id from sprint_areas sa join sprints s on s.id = sa.sprint_id and s.kind = 'fix' and s.name like 'S_' where sa.area_id = page.area_id limit 1),
  (select id from sprints where name = 'S1'))
from page where page.id = t.id;

update tickets set current_sprint_id = (select id from sprints where name = 'F1')
where current_sprint_id in (select id from sprints where name in ('T2', 'T3', 'T4', 'T5', 'F2', 'F3', 'F4', 'F5', 'F6', 'R1'));

delete from sprints where name in ('T2', 'T3', 'T4', 'T5', 'F2', 'F3', 'F4', 'F5', 'F6', 'R1');

update release_settings set release_on = '2026-12-19', go_no_go_on = '2026-12-18', updated_at = now() where id = 1;

insert into schedule_changes (kind, sprint_id, summary, reason, details, actor_id)
values (
  'shift_release',
  (select id from sprints where name = 'S1'),
  'Fix-only sprints: S0 triage and plan this week, S1–S5 fix a group of pages each week from 10 Nov, S6 regression; test sprints retired; release 19 Dec (go/no-go 18 Dec).',
  'Test cases are written by 7 Nov; testing runs a week ahead of each fix sprint, tracked on Test cases progress.',
  jsonb_build_object('release_on', '2026-12-19', 'added', jsonb_build_array('S1', 'S2', 'S3', 'S4', 'S5', 'S6'),
    'removed', jsonb_build_array('T2', 'T3', 'T4', 'T5', 'F2', 'F3', 'F4', 'F5', 'F6', 'R1')),
  (select id from people where lower(email) = 'parikshit.arora@vulqan.ai')
);
