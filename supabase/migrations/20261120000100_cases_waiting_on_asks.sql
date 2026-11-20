-- A case held up by an open ask. Two things the automation team needed:
--
-- 1. A case changes when its asks do. GET /api/cases?updated_since=… only returns cases whose row
--    changed, so linking a case to an ask, unlinking it, or answering the ask left the suite's copy
--    of waiting_on_asks stale. Touching updated_at (not logged as a change) brings the case back.
-- 2. case_latest carries the latest automated result's note and the case's open asks, so the Test
--    cases grid and the sprint boards can show "Waiting · ASK-87" instead of a grey Skipped.

create or replace function touch_cases_of_ask_link() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update test_cases set updated_at = now() where id = coalesce(new.case_id, old.case_id);
  return null;
end $$;

create trigger ask_cases_touch_case after insert or delete on ask_cases
  for each row execute function touch_cases_of_ask_link();

create or replace function touch_cases_of_ask() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.state is distinct from old.state then
    update test_cases set updated_at = now() where id in (select case_id from ask_cases where ask_id = new.id);
  end if;
  return null;
end $$;

create trigger asks_touch_cases after update of state on asks
  for each row execute function touch_cases_of_ask();

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
  c.legacy_tc_id,
  c.scenario_id,
  c.requirement_id,
  c.needs_detail,
  c.automation_block,
  la.note as auto_note,
  array(select k.key from ask_cases ac join asks k on k.id = ac.ask_id
        where ac.case_id = c.id and k.state = 'open' order by k.num) as waiting_asks
from test_cases c
join areas a on a.id = c.area_id
left join people tp on tp.id = c.tester_id
left join lateral (
  select r.result, r.recorded_at, r.sprint_id, r.note from test_runs r
  where r.case_id = c.id and r.kind = 'auto' order by r.recorded_at desc limit 1
) la on true
left join lateral (
  select r.result, r.recorded_at, r.sprint_id from test_runs r
  where r.case_id = c.id and r.kind = 'manual' order by r.recorded_at desc limit 1
) lm on true
where c.retired_at is null;
