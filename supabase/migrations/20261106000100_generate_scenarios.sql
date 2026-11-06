-- Scenario IDs for the cases that had none, one per page as the others are, with Data Flow's new
-- cases grouped by what they test. Only blanks are filled. Each requirement has the scenario's number.
update test_cases c
set scenario_id = m.scenario_id, requirement_id = replace(m.scenario_id, 'TS_', 'REQ_')
from areas a
join (values
  ('Landing', 'Create Engine', 'TS_FN_39'),
  ('Logic Builder', 'Overview', 'TS_FN_40'),
  ('Logic Builder', 'Objects', 'TS_FN_41'),
  ('Logic Builder', 'Variables', 'TS_FN_42'),
  ('Logic Builder', 'Lists', 'TS_FN_43'),
  ('Logic Store', 'Objects', 'TS_FN_44'),
  ('Logic Store', 'Variables', 'TS_FN_45'),
  ('Logic Store', 'Lists', 'TS_FN_46'),
  ('Logic Store', 'Identifiers', 'TS_FN_47'),
  ('Logic Store', 'Relationships', 'TS_FN_48')
) as m(zone, page, scenario_id) on m.zone = a.zone and m.page = a.page
where c.area_id = a.id and c.scenario_id is null and c.requirement_id is null;

update test_cases c
set scenario_id = g.scenario_id, requirement_id = replace(g.scenario_id, 'TS_', 'REQ_')
from (
  select t.id, case
    when t.title ilike 'End to end%' then 'TS_E2E_11'
    when substring(t.tc_id from 4)::int between 2238 and 2253 then 'TS_FN_49' -- Publish
    when substring(t.tc_id from 4)::int between 545 and 565 then 'TS_FN_50'   -- Consult MyLO
  end as scenario_id
  from test_cases t
  join areas a on a.id = t.area_id
  where a.zone = 'My Flow' and a.page = 'Data Flow' and t.tc_id ~ '^TC_[0-9]+$'
) g
where c.id = g.id and g.scenario_id is not null
  and c.scenario_id is null and c.requirement_id is null;

-- A new case with no scenario takes its page's, when the page has exactly one. Its requirement has
-- the scenario's number unless one was given. Pages with several scenarios, or none, stay blank.
create function case_default_scenario() returns trigger language plpgsql as $$
begin
  if new.scenario_id is null then
    select min(c.scenario_id) into new.scenario_id
    from test_cases c
    where c.area_id = new.area_id and c.scenario_id is not null
    having count(distinct c.scenario_id) = 1;
  end if;
  if new.requirement_id is null and new.scenario_id ~ '^TS_' then
    new.requirement_id := 'REQ_' || substring(new.scenario_id from 4);
  end if;
  return new;
end $$;
create trigger test_cases_default_scenario before insert on test_cases
  for each row execute function case_default_scenario();
