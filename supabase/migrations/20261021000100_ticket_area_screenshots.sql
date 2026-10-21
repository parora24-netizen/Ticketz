-- A ticket raised on its own (not from a test case) says where the problem is, and any ticket
-- can carry screenshots like a result does. Developers may attach them too.
alter table tickets add column area_id uuid references areas on delete set null;
alter table tickets add column attachments text[] not null default '{}';

-- ticket_list took t.* when it was made, so it is rebuilt to show the new columns. Its area is
-- the test case's when the ticket has one, else the ticket's own.
drop view ticket_list;
create view ticket_list with (security_invoker = on) as
select
  t.id, t.key, t.kind, t.case_id, t.title, t.description, t.severity, t.state, t.owner_id,
  t.found_in_sprint_id, t.current_sprint_id, t.fixed_in_build, t.defer_reason, t.duplicate_of,
  t.logged_on, t.created_by, t.updated_at, t.attachments,
  p.name as owner_name, c.tc_id, a.zone, a.page, a.id as area_id
from tickets t
left join people p on p.id = t.owner_id
left join test_cases c on c.id = t.case_id
left join areas a on a.id = coalesce(c.area_id, t.area_id);

drop policy evidence_upload on storage.objects;
create policy evidence_upload on storage.objects for insert
  with check (bucket_id = 'evidence' and (select public.has_role('{lead,qa,dev}')));
