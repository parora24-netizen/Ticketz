-- A new page, My Flow · Schedules: writer, dates and sprints as My Flow · Agents, last in its zone.
insert into areas (zone, page, sort, in_release, owner_id, due_on, automate_due_on)
select zone, 'Schedules', 2000, in_release, owner_id, due_on, automate_due_on
from areas where zone = 'My Flow' and page = 'Agents';

insert into sprint_areas (sprint_id, area_id)
select sa.sprint_id, n.id
from areas n
join areas s on s.zone = 'My Flow' and s.page = 'Agents'
join sprint_areas sa on sa.area_id = s.id
where n.zone = 'My Flow' and n.page = 'Schedules'
on conflict do nothing;

-- Keep zones together and in order.
update areas a set sort = o.n
from (
  select id, row_number() over (order by zone_first, sort) as n
  from (
    select id, sort, min(sort) over (partition by zone) as zone_first from areas
  ) z
) o
where o.id = a.id;
