-- Renumber every test case and ticket, keeping the old ID alongside. Run once the code that
-- resolves old IDs is live. Cases go in page order, tickets in the order they were logged, with
-- DEV and MM numbered separately. Results, comments and history hang off row ids, so they stay put.
-- Triggers are off so this is not recorded as an edit: no change log rows, notifications or new
-- updated_at on rows nobody really changed.
alter table test_cases disable trigger user;
alter table tickets disable trigger user;

update test_cases set legacy_tc_id = tc_id where tc_id !~ '^TC_\d+$';
update tickets set legacy_key = key;

-- Through a temporary value first, because a new ID can equal another row's current one.
update test_cases set tc_id = 'TMP_' || id;
update test_cases c set tc_id = 'TC_' || o.n
from (
  select c.id, row_number() over (
    order by a.sort, (regexp_match(coalesce(c.legacy_tc_id, ''), '(\d+)$'))[1]::int nulls last, c.legacy_tc_id, c.id
  ) as n
  from test_cases c join areas a on a.id = c.area_id
) o
where o.id = c.id;

update tickets set key = 'TMP_' || id;
update tickets t set key = o.prefix || '-' || o.n
from (
  select id, case when kind = 'test_mismatch' then 'MM' else 'DEV' end as prefix,
    row_number() over (partition by kind order by logged_on, legacy_key, id) as n
  from tickets
) o
where o.id = t.id;

select setval('tc_id_seq', greatest((select count(*) from test_cases), 1), (select count(*) from test_cases) > 0);
select setval('dev_key_seq', greatest((select count(*) from tickets where kind <> 'test_mismatch'), 1), (select count(*) from tickets where kind <> 'test_mismatch') > 0);
select setval('mm_key_seq', greatest((select count(*) from tickets where kind = 'test_mismatch'), 1), (select count(*) from tickets where kind = 'test_mismatch') > 0);

alter table test_cases enable trigger user;
alter table tickets enable trigger user;
