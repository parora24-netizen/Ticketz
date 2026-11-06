-- Five new Landing pages for the Create flows, written by Sara. Dates and sprints as Landing · Landing,
-- last in their zone. They start with no cases and not Completed; the cases come by upload.
insert into areas (zone, page, sort, in_release, owner_id, due_on, automate_due_on)
select s.zone, n.page, 2000 + n.ord, s.in_release, (select id from people where name = 'Sara'), s.due_on, s.automate_due_on
from areas s
cross join (values
  ('Create Engine', 1),
  ('Create (Blank Canvas)', 2),
  ('Create (Upload Your Data Model)', 3),
  ('Create (MyLO)', 4),
  ('Create (Read from Source)', 5)
) as n(page, ord)
where s.zone = 'Landing' and s.page = 'Landing';

insert into sprint_areas (sprint_id, area_id)
select sa.sprint_id, n.id
from areas n
join areas s on s.zone = 'Landing' and s.page = 'Landing'
join sprint_areas sa on sa.area_id = s.id
where n.zone = 'Landing' and n.page like 'Create%'
on conflict do nothing;

-- Keep zones together and in order.
update areas a set sort = o.n
from (
  select id, row_number() over (order by zone_first, sort) as n
  from (select id, sort, min(sort) over (partition by zone) as zone_first from areas) z
) o
where o.id = a.id;
