-- Test first, fix after. Sprints get a type: triage (S0), test (write, automate, run and test
-- cases, QA), fix (tickets, devs) and regression (everything once more). The planned S1..S11,
-- which mixed testing and fixing, are replaced by T1..T4, F1..F4 and R1.

create type sprint_kind as enum ('triage', 'test', 'fix', 'regression');
alter table sprints add column kind sprint_kind not null default 'test';
update sprints set kind = 'triage' where name = 'S0';

-- Nothing has run in the old planned sprints; clear any pointers to them, then remove them.
with old as (select id from sprints where status = 'planned' and name ~ '^S([1-9]|1[01])$')
update tickets set current_sprint_id = null where current_sprint_id in (select id from old);
with old as (select id from sprints where status = 'planned' and name ~ '^S([1-9]|1[01])$')
update tickets set found_in_sprint_id = null where found_in_sprint_id in (select id from old);
with old as (select id from sprints where status = 'planned' and name ~ '^S([1-9]|1[01])$')
update test_runs set sprint_id = null where sprint_id in (select id from old);
delete from sprints where status = 'planned' and name ~ '^S([1-9]|1[01])$';

insert into sprints (name, kind, starts_on, ends_on, goal) values
  ('T1', 'test', '2026-10-21', '2026-10-23', 'Test Engine: write missing cases, automate, run, test by hand'),
  ('T2', 'test', '2026-10-26', '2026-10-28', 'Test Logic Builder part 1'),
  ('T3', 'test', '2026-10-29', '2026-11-02', 'Test Logic Builder part 2'),
  ('T4', 'test', '2026-11-03', '2026-11-05', 'Test Quality Queue, Data Hub and Delivery Station'),
  ('F1', 'fix', '2026-11-06', '2026-11-10', 'Fix Critical tickets'),
  ('F2', 'fix', '2026-11-11', '2026-11-13', 'Fix High tickets'),
  ('F3', 'fix', '2026-11-16', '2026-11-18', 'Fix Medium and Low tickets'),
  ('F4', 'fix', '2026-11-19', '2026-11-23', 'Leftovers and retests'),
  ('R1', 'regression', '2026-11-24', '2026-11-27', 'Regression across every area before go/no-go');

insert into sprint_areas (sprint_id, area_id)
select s.id, a.id from sprints s join areas a on (
  (s.name = 'T1' and a.zone = 'Engine') or
  (s.name = 'T2' and a.zone = 'Logic Builder' and a.page in ('Landing', 'Create', 'Data Flow', 'Cleanser', 'Mapper', 'Variables', 'Lists')) or
  (s.name = 'T3' and a.zone = 'Logic Builder' and a.page in ('Identifiers', 'Relationships', 'Screens', 'Queries', 'Templates', 'APIs', 'Agents', 'Actions')) or
  (s.name = 'T4' and a.zone in ('Quality Queue', 'Data Hub', 'Delivery Station')) or
  (s.name = 'R1' and a.zone not in ('Data MAIA', 'Ask MAIA'))
);

-- Open tickets go to the fix sprint for their severity.
update tickets t set current_sprint_id = s.id
from sprints s
where t.state not in ('closed', 'deferred', 'duplicate')
  and s.name = case t.severity when 'Critical' then 'F1' when 'High' then 'F2' else 'F3' end;
