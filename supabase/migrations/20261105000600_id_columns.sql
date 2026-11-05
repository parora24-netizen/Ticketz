-- Launchpad makes its own IDs: TC_1, DEV-1, MM-1. This step is additive, so the code that also
-- understands old IDs can go live before anything is renumbered. legacy_* hold the old IDs for now.
alter table test_cases add column legacy_tc_id text;
create unique index test_cases_legacy_tc_id on test_cases (legacy_tc_id) where legacy_tc_id is not null;
alter table tickets add column legacy_key text;
create unique index tickets_legacy_key on tickets (legacy_key) where legacy_key is not null;

create or replace view case_latest with (security_invoker = on) as
select
  c.id, c.tc_id, c.title, c.priority, c.automation, c.area_id, c.source_page,
  a.zone, a.page, a.sort as area_sort,
  la.result as auto_result, la.recorded_at as auto_at, la.sprint_id as auto_sprint_id,
  lm.result as manual_result, lm.recorded_at as manual_at, lm.sprint_id as manual_sprint_id,
  (select count(*) from tickets t
    where t.case_id = c.id and t.state in ('new', 'triaged', 'in_fix', 'reopened'))::int as open_fix,
  (select count(*) from tickets t
    where t.case_id = c.id and t.state = 'ready_for_retest')::int as awaiting_retest,
  c.tester_id,
  tp.name as tester_name,
  c.legacy_tc_id
from test_cases c
join areas a on a.id = c.area_id
left join people tp on tp.id = c.tester_id
left join lateral (
  select r.result, r.recorded_at, r.sprint_id from test_runs r
  where r.case_id = c.id and r.kind = 'auto' order by r.recorded_at desc limit 1
) la on true
left join lateral (
  select r.result, r.recorded_at, r.sprint_id from test_runs r
  where r.case_id = c.id and r.kind = 'manual' order by r.recorded_at desc limit 1
) lm on true;

create or replace view ticket_list with (security_invoker = on) as
select
  t.id, t.key, t.kind, t.case_id, t.title, t.description, t.severity, t.state, t.owner_id,
  t.found_in_sprint_id, t.current_sprint_id, t.fixed_in_build, t.defer_reason, t.duplicate_of,
  t.logged_on, t.created_by, t.updated_at, t.attachments, t.blocked_reason, t.blocked_at, t.defect_id,
  p.name as owner_name, c.tc_id, a.zone, a.page, a.id as area_id,
  t.legacy_key
from tickets t
left join people p on p.id = t.owner_id
left join test_cases c on c.id = t.case_id
left join areas a on a.id = coalesce(c.area_id, t.area_id);

-- IDs come from sequences: safe when two people save at once, and a number is never used again,
-- even after its case or ticket is deleted. The renumbering sets where they start.
create sequence tc_id_seq;
create sequence dev_key_seq;
create sequence mm_key_seq;
grant usage on sequence tc_id_seq, dev_key_seq, mm_key_seq to authenticated, service_role;

/** The next test case ID, TC_<n>. */
drop function next_tc_id();
create function next_tc_id() returns text
language sql as $$ select 'TC_' || nextval('tc_id_seq')::text $$;

/** Several test case IDs at once, for an import. */
create function next_tc_ids(how_many int) returns text[]
language sql as $$ select array_agg('TC_' || nextval('tc_id_seq')::text) from generate_series(1, how_many) $$;

/** The next ticket key: DEV-<n> for a defect, MM-<n> for a mismatch. */
create function next_ticket_key(prefix text) returns text
language sql as $$
  select prefix || '-' || nextval(case prefix when 'MM' then 'mm_key_seq' else 'dev_key_seq' end::regclass)::text
$$;

revoke execute on function next_tc_id(), next_tc_ids(int), next_ticket_key(text) from anon, public;
grant execute on function next_tc_id(), next_tc_ids(int), next_ticket_key(text) to authenticated, service_role;
