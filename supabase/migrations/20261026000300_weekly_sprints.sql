-- From T2 on, each sprint is a full Monday-to-Friday week (24 Nov is a holiday). Regression runs
-- 7-9 Dec so go/no-go stays 10 Dec and the release 11 Dec.

update sprints set starts_on = v.s::date, ends_on = v.e::date
from (values
  ('T2', '2026-11-02', '2026-11-06'), ('F2', '2026-11-02', '2026-11-06'),
  ('T3', '2026-11-09', '2026-11-13'), ('F3', '2026-11-09', '2026-11-13'),
  ('T4', '2026-11-16', '2026-11-20'), ('F4', '2026-11-16', '2026-11-20'),
  ('T5', '2026-11-23', '2026-11-27'), ('F5', '2026-11-23', '2026-11-27'),
  ('F6', '2026-11-30', '2026-12-04'),
  ('R1', '2026-12-07', '2026-12-09')
) as v(name, s, e)
where sprints.name = v.name and sprints.status = 'planned';

insert into schedule_changes (kind, sprint_id, summary, reason, details, actor_id)
values (
  'extend_sprint',
  (select id from sprints where name = 'T2'),
  'Sprints from T2 on are a week each: T2/F2 2-6 Nov, T3/F3 9-13 Nov, T4/F4 16-20 Nov, T5/F5 23-27 Nov, F6 30 Nov-4 Dec, R1 7-9 Dec. Release stays 11 Dec (go/no-go 10 Dec).',
  'Sprints are one week, not two or three days.',
  jsonb_build_object('length', '1 week'),
  (select id from people where lower(email) = 'parikshit.arora@vulqan.ai')
);
