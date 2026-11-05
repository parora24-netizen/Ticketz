-- Sprints become two weeks, starting from this one: S0 is no more, it becomes S1 and runs to 13 Nov
-- (keeping its results and tickets). Regression follows the fixes, and the release follows the holidays.
--   S1  2–13 Nov       Engine (was S0 and S1)
--   S2  16–27 Nov      My Flow, Landing, Data Importer, Data Hub (were S2 and S3)
--   S3  30 Nov–11 Dec  Logic Builder, Logic Store, Data Exporter (were S4 and S5)
--   S4  14–18 Dec      what carries over
--   S5  21–25 Dec      regression (was S6); go/no-go Thu 24 Dec, release Mon 28 Dec
-- Automation due dates stay as they are.

-- Tickets follow their pages. Old S1 goes to the S0 row, which takes its name below.
update tickets set current_sprint_id = (select id from sprints where name = 'S0')
where current_sprint_id = (select id from sprints where name = 'S1');
update tickets set current_sprint_id = (select id from sprints where name = 'S2')
where current_sprint_id = (select id from sprints where name = 'S3');

delete from sprint_areas where sprint_id in (select id from sprints where name in ('S3', 'S4'));
delete from sprints where name in ('S1', 'S5');

update sprints set name = 'S1', kind = 'fix', starts_on = '2026-11-02', ends_on = '2026-11-13', goal = 'Fix Engine' where name = 'S0';
update sprints set starts_on = '2026-11-16', ends_on = '2026-11-27', goal = 'Fix My Flow, Landing, Data Importer and Data Hub' where name = 'S2';
update sprints set starts_on = '2026-11-30', ends_on = '2026-12-11', goal = 'Fix Logic Builder, Logic Store and Data Exporter' where name = 'S3';
update sprints set starts_on = '2026-12-14', ends_on = '2026-12-18', goal = 'Fix what carries over' where name = 'S4';
update sprints set name = 'S5', starts_on = '2026-12-21', ends_on = '2026-12-25', goal = 'Regression across every page; go/no-go 24 Dec, release 28 Dec' where name = 'S6';

insert into sprint_areas (sprint_id, area_id)
select s.id, a.id from sprints s join areas a on a.in_release is not false and (
     (s.name = 'S2' and a.zone in ('Data Importer', 'Data Hub'))
  or (s.name = 'S3' and a.zone in ('Logic Builder', 'Logic Store', 'Data Exporter')))
where s.name in ('S2', 'S3')
on conflict do nothing;

update release_settings set release_on = '2026-12-28', go_no_go_on = '2026-12-24', updated_at = now() where id = 1;

insert into schedule_changes (kind, sprint_id, summary, reason, details, actor_id)
values (
  'shift_release',
  (select id from sprints where name = 'S1'),
  'Sprints are two weeks: S0 becomes S1 (Engine, 2–13 Nov); S2 My Flow, Landing, Data Importer, Data Hub (16–27 Nov); S3 Logic Builder, Logic Store, Data Exporter (30 Nov–11 Dec); S4 carry-over (14–18 Dec); S5 regression (21–25 Dec, was S6). Tickets follow their pages. Release moves from 18 Dec to 28 Dec (go/no-go 24 Dec).',
  'Two-week fix sprints, with regression the week of 21 Dec and the release after the holidays.',
  jsonb_build_object('release_on', '2026-12-28', 'removed', jsonb_build_array('S0'), 'renamed', jsonb_build_object('S0', 'S1', 'S6', 'S5')),
  (select id from people where lower(email) = 'parikshit.arora@vulqan.ai')
);
