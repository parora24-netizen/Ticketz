-- The team can read the history of test cases and tickets, which they can already read today.
-- History of people and sprints stays with the leads.
create policy team_case_ticket_changes_read on change_log for select
  using (table_name in ('test_cases', 'tickets') and (select is_member()));
