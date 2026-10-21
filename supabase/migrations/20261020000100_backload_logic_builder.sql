-- Logic Builder goes last: T2 now tests Quality Queue, Data Hub and Delivery Station, T3 and T4
-- take Logic Builder. Dates are unchanged; each fix sprint still follows its test sprint.

delete from sprint_areas
where sprint_id in (select id from sprints where name in ('T2', 'T3', 'T4') and status = 'planned');

insert into sprint_areas (sprint_id, area_id)
select s.id, a.id from sprints s join areas a on (
  (s.name = 'T2' and a.zone in ('Quality Queue', 'Data Hub', 'Delivery Station')) or
  (s.name = 'T3' and a.zone = 'Logic Builder' and a.page in ('Landing', 'Create', 'Data Flow', 'Cleanser', 'Mapper', 'Variables', 'Lists')) or
  (s.name = 'T4' and a.zone = 'Logic Builder' and a.page in ('Identifiers', 'Relationships', 'Screens', 'Queries', 'Templates', 'APIs', 'Agents', 'Actions'))
)
where s.name in ('T2', 'T3', 'T4') and s.status = 'planned';

update sprints set goal = v.goal
from (values
  ('T2', 'Test Quality Queue, Data Hub and Delivery Station'),
  ('T3', 'Test Logic Builder part 1'),
  ('T4', 'Test Logic Builder part 2'),
  ('F2', 'Fix what T1 (Engine) found'),
  ('F3', 'Fix what T2 (Quality Queue, Data Hub, Delivery Station) found'),
  ('F4', 'Fix what T3 (Logic Builder part 1) found'),
  ('F5', 'Fix what T4 (Logic Builder part 2) found')
) as v(name, goal)
where sprints.name = v.name and sprints.status <> 'closed';

-- Medium and Low tickets follow their page to the fix sprint after its test sprint again.
update tickets t set current_sprint_id = f.id
from test_cases c
join sprint_areas sa on sa.area_id = c.area_id
join sprints ts on ts.id = sa.sprint_id and ts.kind = 'test'
join sprints f on f.name = 'F' || (substring(ts.name from 2)::int + 1)
where t.case_id = c.id
  and t.state not in ('closed', 'deferred', 'duplicate') and t.severity not in ('Critical', 'High');
