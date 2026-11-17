-- QA can hand a ticket on, not only test it: put it In progress for whoever owns it (a dev, or
-- Juan for an automated test to fix), and close a reopened ticket whose case now passes or that
-- turned out not to be a real problem.
insert into ticket_transitions (from_state, to_state, role) values
  ('new', 'in_fix', 'qa'),
  ('triaged', 'in_fix', 'qa'),
  ('reopened', 'in_fix', 'qa'),
  ('reopened', 'closed', 'qa'),
  ('reopened', 'closed', 'lead')
on conflict do nothing;
