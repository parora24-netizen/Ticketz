-- A ticket can be marked blocked (with what is blocking it) while it is open. It is a flag, not
-- a workflow state: the ticket keeps its place in the fix loop and goes on from there once
-- unblocked. The fix board shows blocked tickets in their own column.
alter table tickets add column blocked_reason text check (length(blocked_reason) <= 2000);
alter table tickets add column blocked_at timestamptz;

-- ticket_list names its columns, so it is rebuilt to carry the new ones.
drop view ticket_list;
create view ticket_list with (security_invoker = on) as
select
  t.id, t.key, t.kind, t.case_id, t.title, t.description, t.severity, t.state, t.owner_id,
  t.found_in_sprint_id, t.current_sprint_id, t.fixed_in_build, t.defer_reason, t.duplicate_of,
  t.logged_on, t.created_by, t.updated_at, t.attachments, t.blocked_reason, t.blocked_at,
  p.name as owner_name, c.tc_id, a.zone, a.page, a.id as area_id
from tickets t
left join people p on p.id = t.owner_id
left join test_cases c on c.id = t.case_id
left join areas a on a.id = coalesce(c.area_id, t.area_id);
