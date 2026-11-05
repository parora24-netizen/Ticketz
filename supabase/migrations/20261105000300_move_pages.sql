-- Framework changes:
--   My Flow · Actions moves to Data Hub.
--   My Flow · APIs and Data Exporter · APIs become one page, Data Importer · APIs. Both are empty.
--   Data Exporter gains a Mapper page, alongside Data Importer · Mapper.
-- A moved or new page takes its sprints and dates from its new zone.

delete from areas where zone = 'Data Exporter' and page = 'APIs';
update areas set zone = 'Data Hub', sort = sort + 1000 where zone = 'My Flow' and page = 'Actions';
update areas set zone = 'Data Importer', sort = sort + 1000 where zone = 'My Flow' and page = 'APIs';

insert into areas (zone, page, sort, in_release, owner_id, due_on, automate_due_on)
select zone, 'Mapper', 2000, in_release, owner_id, due_on, automate_due_on
from areas where zone = 'Data Exporter' and page = 'Queries';

update areas a set automate_due_on = s.automate_due_on, due_on = s.due_on
from areas s
where (a.zone, a.page, s.zone, s.page) in (
  ('Data Hub', 'Actions', 'Data Hub', 'Screens'),
  ('Data Importer', 'APIs', 'Data Importer', 'Cleanser'));

delete from sprint_areas where area_id in (
  select id from areas where (zone, page) in (('Data Hub', 'Actions'), ('Data Importer', 'APIs')));

insert into sprint_areas (sprint_id, area_id)
select sa.sprint_id, a.id
from areas a
join areas s on (a.zone, a.page, s.zone, s.page) in (
  ('Data Hub', 'Actions', 'Data Hub', 'Screens'),
  ('Data Importer', 'APIs', 'Data Importer', 'Cleanser'),
  ('Data Exporter', 'Mapper', 'Data Exporter', 'Queries'))
join sprint_areas sa on sa.area_id = s.id
on conflict do nothing;

-- Keep zones together and in order, moved pages last in theirs.
update areas a set sort = o.n
from (
  select id, row_number() over (order by zone_first, sort) as n
  from (select id, sort, min(sort) over (partition by zone) as zone_first from areas) z
) o
where o.id = a.id;
