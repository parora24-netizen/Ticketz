-- Niten's new functional cases on Cleanser and Mapper took their page's only scenario, which was the
-- end-to-end one (TS_5, TS_6). They get scenarios of their own; the end-to-end cases stay where they
-- are. New cases have no old ID, which is what tells them apart. Stops unless the counts are as expected.
do $$
declare
  cleanser text := 'TS_' || nextval('scenario_id_seq');
  mapper text := 'TS_' || nextval('scenario_id_seq');
  moved int;
begin
  update test_cases c set scenario_id = cleanser, requirement_id = replace(cleanser, 'TS_', 'REQ_')
  from areas a
  where a.id = c.area_id and a.zone = 'Data Importer' and a.page = 'Cleanser' and c.scenario_id = 'TS_5' and c.legacy_tc_id is null;
  get diagnostics moved = row_count;
  if moved <> 36 then raise exception 'Expected 36 Cleanser cases, found %', moved; end if;

  update test_cases c set scenario_id = mapper, requirement_id = replace(mapper, 'TS_', 'REQ_')
  from areas a
  where a.id = c.area_id and a.zone = 'Data Importer' and a.page = 'Mapper' and c.scenario_id = 'TS_6' and c.legacy_tc_id is null;
  get diagnostics moved = row_count;
  if moved <> 43 then raise exception 'Expected 43 Mapper cases, found %', moved; end if;
end $$;
