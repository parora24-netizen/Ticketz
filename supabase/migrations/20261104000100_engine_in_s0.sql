-- Engine is already tested, so its fixes start now: Engine's open tickets move to S0, and new
-- Engine tickets go there while S0 runs (S2 again once S0 closes).
insert into sprint_areas (sprint_id, area_id)
select s.id, a.id from sprints s join areas a on a.zone = 'Engine' and a.in_release is not false
where s.name = 'S0'
on conflict do nothing;

update tickets t set current_sprint_id = (select id from sprints where name = 'S0')
where t.state in ('new', 'triaged', 'in_fix', 'reopened', 'ready_for_retest')
  and (select a.zone from areas a
       where a.id = coalesce(t.area_id, (select c.area_id from test_cases c where c.id = t.case_id))) = 'Engine';
