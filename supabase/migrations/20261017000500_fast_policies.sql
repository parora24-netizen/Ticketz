-- Speed: wrap the membership checks in (select ...) so Postgres evaluates them once per query
-- instead of once per row. Same rules as before; only the evaluation changes.
-- Measured on case_latest as a signed-in user: 64 ms before.

drop policy read_people on people;
drop policy read_areas on areas;
drop policy read_sprints on sprints;
drop policy read_sprint_areas on sprint_areas;
drop policy read_cases on test_cases;
drop policy read_runs on test_runs;
drop policy read_tickets on tickets;
drop policy read_events on ticket_events;
drop policy read_transitions on ticket_transitions;
drop policy read_tasks on plan_tasks;
drop policy lead_people on people;
drop policy lead_areas on areas;
drop policy lead_sprints on sprints;
drop policy lead_sprint_areas on sprint_areas;
drop policy lead_tokens on ci_tokens;
drop policy qa_cases_insert on test_cases;
drop policy qa_cases_update on test_cases;
drop policy qa_runs_insert on test_runs;
drop policy member_tickets_insert on tickets;
drop policy member_tickets_update on tickets;
drop policy member_tasks_update on plan_tasks;
drop policy lead_tasks_write on plan_tasks;
drop policy lead_tasks_delete on plan_tasks;
drop policy read_comments on ticket_comments;
drop policy write_own_comment on ticket_comments;
drop policy edit_own_comment on ticket_comments;
drop policy read_task_events on plan_task_events;

create policy read_people on people for select using ((select is_member()));
create policy read_areas on areas for select using ((select is_member()));
create policy read_sprints on sprints for select using ((select is_member()));
create policy read_sprint_areas on sprint_areas for select using ((select is_member()));
create policy read_cases on test_cases for select using ((select is_member()));
create policy read_runs on test_runs for select using ((select is_member()));
create policy read_tickets on tickets for select using ((select is_member()));
create policy read_events on ticket_events for select using ((select is_member()));
create policy read_transitions on ticket_transitions for select using ((select is_member()));
create policy read_tasks on plan_tasks for select using ((select is_member()));
create policy read_comments on ticket_comments for select using ((select is_member()));
create policy read_task_events on plan_task_events for select using ((select is_member()));

create policy lead_people on people for all using ((select has_role('{lead}'))) with check ((select has_role('{lead}')));
create policy lead_areas on areas for all using ((select has_role('{lead}'))) with check ((select has_role('{lead}')));
create policy lead_sprints on sprints for all using ((select has_role('{lead}'))) with check ((select has_role('{lead}')));
create policy lead_sprint_areas on sprint_areas for all using ((select has_role('{lead}'))) with check ((select has_role('{lead}')));
create policy lead_tokens on ci_tokens for all using ((select has_role('{lead}'))) with check ((select has_role('{lead}')));

create policy qa_cases_insert on test_cases for insert with check ((select has_role('{lead,qa}')));
create policy qa_cases_update on test_cases for update using ((select has_role('{lead,qa}'))) with check ((select has_role('{lead,qa}')));
create policy qa_runs_insert on test_runs for insert
  with check ((select has_role('{lead,qa}')) and kind = 'manual' and recorded_by = (select current_person_id()));

create policy member_tickets_insert on tickets for insert with check ((select is_member()));
create policy member_tickets_update on tickets for update using ((select is_member())) with check ((select is_member()));

create policy member_tasks_update on plan_tasks for update using ((select is_member())) with check ((select is_member()));
create policy lead_tasks_write on plan_tasks for insert with check ((select has_role('{lead}')));
create policy lead_tasks_delete on plan_tasks for delete using ((select has_role('{lead}')));

create policy write_own_comment on ticket_comments for insert with check (author_id = (select current_person_id()));
create policy edit_own_comment on ticket_comments for update using (author_id = (select current_person_id()))
  with check (author_id = (select current_person_id()));
