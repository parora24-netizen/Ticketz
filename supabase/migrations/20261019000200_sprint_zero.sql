-- Sprint 0: the triage tasks from the plan, before testing starts. S1 and every later sprint
-- move two working days to make room. Also: plan tasks can belong to a sprint, and the lead can
-- delete plan tasks, tickets and test cases.

-- Plan tasks in sprints.
alter table plan_tasks add column sprint_id uuid references sprints on delete set null;
create index plan_tasks_sprint_idx on plan_tasks (sprint_id);

-- Deleting a test case keeps its tickets (they lose the link); deleting a ticket clears
-- "duplicate of" pointers to it. Events, comments and results already go with their parent.
alter table tickets drop constraint tickets_case_id_fkey;
alter table tickets add constraint tickets_case_id_fkey foreign key (case_id) references test_cases on delete set null;
alter table tickets drop constraint tickets_duplicate_of_fkey;
alter table tickets add constraint tickets_duplicate_of_fkey foreign key (duplicate_of) references tickets on delete set null;

create policy lead_tickets_delete on tickets for delete using ((select has_role('{lead}')));
create policy lead_cases_delete on test_cases for delete using ((select has_role('{lead}')));

-- S1..S11 two working days later (worked out with the app's working-day rule, weekends skipped).
update sprints set starts_on = v.s::date, ends_on = v.e::date
from (values
  ('S1', '2026-10-21', '2026-10-23'), ('S2', '2026-10-26', '2026-10-29'), ('S3', '2026-10-30', '2026-11-03'),
  ('S4', '2026-11-04', '2026-11-06'), ('S5', '2026-11-09', '2026-11-10'), ('S6', '2026-11-11', '2026-11-13'),
  ('S7', '2026-11-16', '2026-11-17'), ('S8', '2026-11-18', '2026-11-19'), ('S9', '2026-11-20', '2026-11-24'),
  ('S10', '2026-11-25', '2026-11-30'), ('S11', '2026-12-01', '2026-12-03')
) as v(name, s, e)
where sprints.name = v.name and sprints.status <> 'closed';

insert into sprints (name, starts_on, ends_on, goal)
values ('S0', '2026-10-19', '2026-10-20', 'Triage: owners for every failing ticket, decisions and fixes before testing starts');

update plan_tasks set sprint_id = (select id from sprints where name = 'S0') where num between 1 and 12;

insert into schedule_changes (kind, sprint_id, summary, reason, details, actor_id)
values (
  'extend_sprint',
  (select id from sprints where name = 'S1'),
  'S0 added (19 to 20 Oct); S1 to S11 moved 2 working days later. S11 now ends 3 Dec, the go/no-go day; release stays 4 Dec.',
  'Triage tasks 1 to 12 run as Sprint 0 before testing starts.',
  jsonb_build_object('days', 2, 'added', 'S0'),
  (select id from people where lower(email) = 'parikshit.arora@vulqan.ai')
);
