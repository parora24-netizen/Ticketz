-- Launchpad makes scenario IDs for pages that have none. Numbers come from a sequence, like test case
-- IDs, and are not reused.
create sequence scenario_id_seq;
grant usage on sequence scenario_id_seq to authenticated, service_role;
select setval('scenario_id_seq', (select max(substring(scenario_id from 4)::int) from test_cases where scenario_id ~ '^TS_[0-9]+$'));

-- The pages with cases but no scenario: one new scenario each, in page order. Only blanks are filled.
with pages as (
  select a.id, 'TS_' || nextval('scenario_id_seq') as scenario_id
  from (
    select a.id from areas a
    where exists (select 1 from test_cases c where c.area_id = a.id)
      and not exists (select 1 from test_cases c where c.area_id = a.id and c.scenario_id is not null)
    order by a.sort
  ) a
)
update test_cases c
set scenario_id = p.scenario_id, requirement_id = replace(p.scenario_id, 'TS_', 'REQ_')
from pages p
where c.area_id = p.id and c.scenario_id is null and c.requirement_id is null;

-- A new case with no scenario takes its page's, when the page has exactly one, and the first case on
-- an empty page starts a new one. A page with several stays blank, for someone to choose.
create or replace function case_default_scenario() returns trigger language plpgsql as $$
begin
  if new.scenario_id is null then
    select min(c.scenario_id) into new.scenario_id
    from test_cases c
    where c.area_id = new.area_id and c.scenario_id is not null
    having count(distinct c.scenario_id) = 1;
    if new.scenario_id is null and not exists (
      select 1 from test_cases c where c.area_id = new.area_id and c.scenario_id is not null
    ) then
      new.scenario_id := 'TS_' || nextval('scenario_id_seq');
    end if;
  end if;
  if new.requirement_id is null and new.scenario_id ~ '^TS_' then
    new.requirement_id := 'REQ_' || substring(new.scenario_id from 4);
  end if;
  return new;
end $$;

-- Check it on a scratch page: a bulk upload must put a whole empty page in one new scenario. The
-- exception undoes the page and its cases; anything but the expected message stops this migration.
do $$
declare
  scratch uuid;
  found int;
  s text;
  r text;
begin
  begin
    insert into areas (zone, page, sort) values ('__check', '__check', 999999) returning id into scratch;
    insert into test_cases (tc_id, area_id, title, priority) values
      ('TC_CHECK_1', scratch, 'one', 'Low'), ('TC_CHECK_2', scratch, 'two', 'Low'), ('TC_CHECK_3', scratch, 'three', 'Low');
    select count(distinct scenario_id), min(scenario_id), min(requirement_id) into found, s, r from test_cases where area_id = scratch;
    if found <> 1 or s is null or r <> replace(s, 'TS_', 'REQ_') or exists (select 1 from test_cases where area_id = scratch and scenario_id is null) then
      raise exception 'scenario check failed: % scenarios, %, %', found, s, r;
    end if;
    raise exception 'scenario check passed';
  exception when others then
    if sqlerrm <> 'scenario check passed' then raise; end if;
  end;
end $$;

-- The check used a number; the next real scenario follows the last real one.
select setval('scenario_id_seq', (select max(substring(scenario_id from 4)::int) from test_cases where scenario_id ~ '^TS_[0-9]+$'));
