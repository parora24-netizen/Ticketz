-- Framework V2 (the workbook's Framework tab, columns G-K): zones regrouped and renamed. Pages are
-- renamed in place so their cases, tickets and history come with them. Each page gets the person
-- writing its cases, the date writing is due and the date it was finished.

alter table areas add column owner_id uuid references people on delete set null;
alter table areas add column due_on date;
alter table areas add column cases_done_on date;

-- Free the old names first: (zone, page) is unique and some new names reuse old ones.
update areas set zone = '~' || zone;

create function pg_temp.move(old_zone text, old_page text, new_zone text, new_page text, pos int) returns void language sql as $$
  update areas set zone = new_zone, page = new_page, sort = pos where zone = '~' || old_zone and page = old_page;
$$;
select pg_temp.move('Engine', 'Sign-On', 'Engine', 'Sign-On', 1);
select pg_temp.move('Engine', 'Admin', 'Engine', 'Admin', 2);
select pg_temp.move('Engine', 'Parameters', 'Engine', 'Parameters', 3);
select pg_temp.move('Engine', 'Permissions', 'Engine', 'Permissions', 4);
select pg_temp.move('Engine', 'Alerts', 'Engine', 'Alerts', 5);
select pg_temp.move('Engine', 'Approvals', 'Engine', 'Approvals', 6);
select pg_temp.move('Engine', 'Notifications', 'Engine', 'Notifications', 7);
select pg_temp.move('Engine', 'Profile', 'Engine', 'Profile', 8);
select pg_temp.move('Logic Builder', 'Landing', 'Landing', 'Landing', 9);
select pg_temp.move('Logic Builder', 'Data Flow', 'My Flow', 'Data Flow', 10);
select pg_temp.move('Logic Builder', 'Create', 'My Flow', 'Create', 11);
select pg_temp.move('Logic Builder', 'APIs', 'My Flow', 'APIs', 12);
select pg_temp.move('Logic Builder', 'Agents', 'My Flow', 'Agents', 13);
select pg_temp.move('Logic Builder', 'Actions', 'My Flow', 'Actions', 14);
select pg_temp.move('Data MAIA', 'Overview', 'Logic Builder', 'Overview', 15);
select pg_temp.move('Data MAIA', 'Objects', 'Logic Builder', 'Objects', 16);
select pg_temp.move('Data MAIA', 'Variables', 'Logic Builder', 'Variables', 17);
select pg_temp.move('Data MAIA', 'Lists', 'Logic Builder', 'Lists', 18);
select pg_temp.move('Data MAIA', 'Documents', 'Logic Builder', 'Documents', 19);
select pg_temp.move('Logic Builder', 'Variables', 'Logic Store', 'Variables', 21);
select pg_temp.move('Logic Builder', 'Lists', 'Logic Store', 'Lists', 22);
select pg_temp.move('Logic Builder', 'Identifiers', 'Logic Store', 'Identifiers', 23);
select pg_temp.move('Logic Builder', 'Relationships', 'Logic Store', 'Relationships', 24);
select pg_temp.move('Logic Builder', 'Cleanser', 'Data Importer', 'Cleanser', 25);
select pg_temp.move('Logic Builder', 'Mapper', 'Data Importer', 'Mapper', 26);
select pg_temp.move('Quality Queue', 'Imports', 'Data Importer', 'Imports', 27);
select pg_temp.move('Quality Queue', 'Exceptions', 'Data Importer', 'Exceptions', 28);
select pg_temp.move('Quality Queue', 'Jobs', 'Data Importer', 'Jobs', 29);
select pg_temp.move('Quality Queue', 'Issues', 'Data Importer', 'Issues', 30);
select pg_temp.move('Quality Queue', 'Activity', 'Data Importer', 'Activity', 31);
select pg_temp.move('Logic Builder', 'Screens', 'Data Hub', 'Screens', 32);
select pg_temp.move('Data Hub', 'Graph', 'Data Hub', 'Graph', 33);
select pg_temp.move('Data Hub', 'Grid', 'Data Hub', 'Grid', 34);
select pg_temp.move('Data Hub', 'Tile', 'Data Hub', 'Tile', 35);
select pg_temp.move('Data Hub', 'Widgets', 'Data Hub', 'Widgets', 36);
select pg_temp.move('Logic Builder', 'Queries', 'Data Exporter', 'Queries', 37);
select pg_temp.move('Logic Builder', 'Templates', 'Data Exporter', 'Templates', 38);
select pg_temp.move('Delivery Station', 'Systems', 'Data Exporter', 'Systems', 40);
select pg_temp.move('Delivery Station', 'People', 'Data Exporter', 'People', 41);
select pg_temp.move('Delivery Station', 'Deliveries', 'Data Exporter', 'Deliveries', 42);
select pg_temp.move('Ask MAIA', 'Ask MAIA', 'Ask MAIA', 'Ask MAIA', 43);
select pg_temp.move('Ask MAIA', 'Favorites and History', 'Ask MAIA', 'Favorites and History', 44);

do $$ begin
  if exists (select 1 from areas where zone like '~%') then
    raise exception 'Framework V2: an old page has no new home: %', (select string_agg(substr(zone, 2) || ' · ' || page, ', ') from areas where zone like '~%');
  end if;
end $$;

insert into areas (zone, page, sort) values ('Logic Store', 'Objects', 20), ('Data Exporter', 'APIs', 39);

-- Who writes each page's cases, and the pages already finished (Framework tab, Owner and Date).
update areas set owner_id = (select id from people where name = 'Niten')
where zone in ('Engine', 'Landing', 'Data Importer', 'Data Hub', 'Data Exporter');
update areas set owner_id = (select id from people where name = 'Sara')
where zone in ('My Flow', 'Logic Builder', 'Logic Store');
update areas set owner_id = (select id from people where name = 'Parikshit') where zone = 'Ask MAIA';

update areas set cases_done_on = date '2026-11-03'
where zone in ('Engine', 'Landing')
   or (zone = 'Data Importer' and page in ('Imports', 'Exceptions', 'Jobs', 'Issues', 'Activity'))
   or (zone = 'Data Hub' and page in ('Graph', 'Grid', 'Tile', 'Widgets'));

-- A page's writer can mark it written (the app limits them to that); the lead changes the rest.
create policy owner_marks_written on areas for update
  using (owner_id = (select current_person_id())) with check (owner_id = (select current_person_id()));

-- Writing is due by the end of this week.
update areas set due_on = date '2026-11-07' where cases_done_on is null and in_release;
