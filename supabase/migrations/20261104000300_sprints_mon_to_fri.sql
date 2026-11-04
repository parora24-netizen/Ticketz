-- The fix-only sprints were set Tuesday to Saturday by mistake; they run Monday to Friday, and every
-- due date lands on a Friday. Release Fri 18 Dec, go/no-go Thu 17 Dec.
update sprints s set starts_on = v.starts_on::date, ends_on = v.ends_on::date
from (values
  ('S0', '2026-11-02', '2026-11-06'),
  ('S1', '2026-11-09', '2026-11-13'),
  ('S2', '2026-11-16', '2026-11-20'),
  ('S3', '2026-11-23', '2026-11-27'),
  ('S4', '2026-11-30', '2026-12-04'),
  ('S5', '2026-12-07', '2026-12-11'),
  ('S6', '2026-12-14', '2026-12-18')
) as v(name, starts_on, ends_on)
where s.name = v.name;
update sprints set goal = 'Regression across every page; go/no-go 17 Dec, release 18 Dec' where name = 'S6';

-- Cases are written by Fri 6 Nov.
update areas set due_on = '2026-11-06' where due_on = '2026-11-07';

-- Automation done the Friday before a page's fixes start; Engine's started this week and end
-- 13 Nov, so it is due this Friday.
update areas set automate_due_on = case zone
  when 'Engine' then date '2026-11-06'
  when 'My Flow' then date '2026-11-13'
  when 'Landing' then date '2026-11-13'
  when 'Data Importer' then date '2026-11-20'
  when 'Data Hub' then date '2026-11-20'
  when 'Logic Builder' then date '2026-11-27'
  when 'Logic Store' then date '2026-11-27'
  when 'Data Exporter' then date '2026-12-04'
  else automate_due_on end
where in_release is not false;

update release_settings set release_on = '2026-12-18', go_no_go_on = '2026-12-17', updated_at = now() where id = 1;

insert into schedule_changes (kind, sprint_id, summary, reason, details, actor_id)
values (
  'shift_release',
  (select id from sprints where name = 'S6'),
  'Sprints S0–S6 corrected to run Monday to Friday (they were a day late); automation due each Friday before a page''s sprint, Engine this Friday; release Fri 18 Dec (go/no-go 17 Dec).',
  'The fix-only plan was set a day late, ending on Saturdays.',
  jsonb_build_object('release_on', '2026-12-18'),
  (select id from people where lower(email) = 'parikshit.arora@vulqan.ai')
);
