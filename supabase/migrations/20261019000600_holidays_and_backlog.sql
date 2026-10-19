-- Office holidays: date maths for sprints skips them. Pre-filled from public lists for India,
-- Oct to Dec 2026; the lead edits them on Admin to match the office calendar.
create table holidays (
  day date primary key,
  name text not null
);
alter table holidays enable row level security;
create policy read_holidays on holidays for select using ((select is_member()));
create policy lead_holidays on holidays for all using ((select has_role('{lead}'))) with check ((select has_role('{lead}')));

insert into holidays (day, name) values
  ('2026-10-20', 'Dussehra'),
  ('2026-11-10', 'Diwali (Balipratipada)'),
  ('2026-11-24', 'Guru Nanak Jayanti'),
  ('2026-12-25', 'Christmas');

-- The backlog, routed the way the plan runs: every Critical and High ticket found so far goes to
-- F1 (alongside T1, so devs start at once); the rest go to the fix sprint that follows the test
-- sprint for their page (T1 -> F2, T2 -> F3, T3 -> F4, T4 -> F5).
update tickets t set current_sprint_id = (select id from sprints where name = 'F1')
where t.state not in ('closed', 'deferred', 'duplicate') and t.severity in ('Critical', 'High');

update tickets t set current_sprint_id = f.id
from test_cases c
join sprint_areas sa on sa.area_id = c.area_id
join sprints ts on ts.id = sa.sprint_id and ts.kind = 'test'
join sprints f on f.name = 'F' || (substring(ts.name from 2)::int + 1)
where t.case_id = c.id
  and t.state not in ('closed', 'deferred', 'duplicate') and t.severity not in ('Critical', 'High');
