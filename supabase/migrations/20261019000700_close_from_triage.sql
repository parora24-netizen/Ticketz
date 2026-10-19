-- Triage can close a ticket outright when its test case already passes (fixed since it was
-- logged, or a stale entry), instead of sending it round the fix loop. QA and the lead only.
insert into ticket_transitions (from_state, to_state, role) values
  ('new', 'closed', 'lead'), ('new', 'closed', 'qa'),
  ('triaged', 'closed', 'lead'), ('triaged', 'closed', 'qa');
