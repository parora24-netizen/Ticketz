-- Scenario and requirement IDs are just numbers, like test case IDs: TS_FN_12 is TS_12, TS_E2E_01 is
-- TS_1. The numbers already ran on from one kind to the other, except TS_E2E_11, which becomes TS_51.
update test_cases
set scenario_id = case scenario_id when 'TS_E2E_11' then 'TS_51' else regexp_replace(scenario_id, '^TS_(FN|E2E)_0*', 'TS_') end,
    requirement_id = case requirement_id when 'REQ_E2E_11' then 'REQ_51' else regexp_replace(requirement_id, '^REQ_(FN|E2E)_0*', 'REQ_') end
where scenario_id ~ '^TS_(FN|E2E)_[0-9]+$' or requirement_id ~ '^REQ_(FN|E2E)_[0-9]+$';
