-- Engine gets two weeks: S0 (Engine 1, with triage and planning) and S1 (Engine 2). The rest
-- slides a week: My Flow and Landing move from S1 to S2, which Engine leaves. S3–S6 and the
-- 19 Dec release stay as they are.
update sprints set goal = 'Triage and plan; Engine 1: fix Engine' where name = 'S0';
update sprints set goal = 'Engine 2: finish Engine fixes' where name = 'S1';
update sprints set goal = 'Fix My Flow and Landing' where name = 'S2';

delete from sprint_areas sa using sprints s, areas a
where s.id = sa.sprint_id and a.id = sa.area_id
  and ((s.name = 'S1' and a.zone in ('My Flow', 'Landing')) or (s.name = 'S2' and a.zone = 'Engine'));

insert into sprint_areas (sprint_id, area_id)
select s.id, a.id from sprints s join areas a on a.in_release is not false and (
     (s.name = 'S1' and a.zone = 'Engine')
  or (s.name = 'S2' and a.zone in ('My Flow', 'Landing')))
where s.name in ('S1', 'S2')
on conflict do nothing;

-- Testing stays a week ahead: My Flow and Landing by Fri 14 Nov.
update areas set automate_due_on = '2026-11-14' where zone in ('My Flow', 'Landing') and in_release is not false;

-- My Flow and Landing's open tickets follow their pages to S2; Engine's stay in S0.
update tickets t set current_sprint_id = (select id from sprints where name = 'S2')
where t.state in ('new', 'triaged', 'in_fix', 'reopened', 'ready_for_retest')
  and t.current_sprint_id = (select id from sprints where name = 'S1')
  and (select a.zone from areas a
       where a.id = coalesce(t.area_id, (select c.area_id from test_cases c where c.id = t.case_id))) in ('My Flow', 'Landing');

insert into schedule_changes (kind, sprint_id, summary, reason, details, actor_id)
values (
  'move_tickets',
  (select id from sprints where name = 'S2'),
  'Engine gets two weeks (S0 Engine 1, S1 Engine 2); My Flow and Landing slide to S2 with their open tickets. Release stays 19 Dec.',
  'Engine is already tested, so its fixes start now.',
  jsonb_build_object('S1', 'Engine', 'S2', jsonb_build_array('My Flow', 'Landing')),
  (select id from people where lower(email) = 'parikshit.arora@vulqan.ai')
);
