-- A ticket's tester: who retests it. Set on the ticket, else its test case's tester. A ticket with no
-- test case (a task, a design change, an admin fix) gets one this way too. The raiser is not assumed.
alter table tickets add column if not exists tester_id uuid references people(id);

-- ticket_list gains the tester as it applies (the ticket's own, else the case's) and the ticket's own.
create or replace view ticket_list with (security_invoker = on) as
select
  t.id, t.key, t.kind, t.case_id, t.title, t.description, t.severity, t.state, t.owner_id,
  t.found_in_sprint_id, t.current_sprint_id, t.fixed_in_build, t.defer_reason, t.duplicate_of,
  t.logged_on, t.created_by, t.updated_at, t.attachments, t.blocked_reason, t.blocked_at, t.defect_id,
  p.name as owner_name, c.tc_id, a.zone, a.page, a.id as area_id,
  t.legacy_key,
  coalesce(t.tester_id, c.tester_id) as tester_id,
  tp.name as tester_name,
  t.tester_id as own_tester_id
from tickets t
left join people p on p.id = t.owner_id
left join test_cases c on c.id = t.case_id
left join areas a on a.id = coalesce(c.area_id, t.area_id)
left join people tp on tp.id = coalesce(t.tester_id, c.tester_id);
