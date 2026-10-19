-- Testing and fixing run side by side. The QA track (triage, test, regression) and the dev
-- track (fix) each have one sprint at a time; each fix sprint takes the backlog by severity plus
-- what the previous test sprint found.

update sprints set starts_on = v.s::date, ends_on = v.e::date, goal = v.goal
from (values
  ('F1', '2026-10-21', '2026-10-23', 'Fix the Critical backlog'),
  ('F2', '2026-10-26', '2026-10-28', 'Fix the High backlog and what T1 found'),
  ('F3', '2026-10-29', '2026-11-02', 'Fix Medium and Low, and what T2 found'),
  ('F4', '2026-11-03', '2026-11-05', 'Fix what T3 found'),
  ('R1', '2026-11-23', '2026-11-27', 'Regression across every area before go/no-go')
) as v(name, s, e, goal)
where sprints.name = v.name and sprints.status <> 'closed';

insert into sprints (name, kind, starts_on, ends_on, goal) values
  ('F5', 'fix', '2026-11-06', '2026-11-13', 'Fix what T4 found'),
  ('F6', 'fix', '2026-11-16', '2026-11-20', 'Leftovers and retests');
