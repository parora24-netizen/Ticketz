-- T1 and F1 were closed by mistake on 26 Oct (they run to 30 Oct). Reopen both and undo exactly
-- what the two closes moved, as recorded in the schedule log (entries 4 and 5).

update sprints set status = 'active', closed_at = null where name in ('T1', 'F1') and status = 'closed';

-- F1's 46 open tickets went to T2; back to F1 (only those still in T2).
update tickets set current_sprint_id = (select id from sprints where name = 'F1')
where current_sprint_id = (select id from sprints where name = 'T2')
  and key in (select jsonb_array_elements_text(details -> 'moved') from schedule_changes where id = 5);

-- T1's open task went to F2, and its 8 unfinished areas were added to F2; undo both.
update plan_tasks set sprint_id = (select id from sprints where name = 'T1')
where num in (select (jsonb_array_elements_text(details -> 'tasks'))::int from schedule_changes where id = 4)
  and sprint_id = (select id from sprints where name = 'F2');
delete from sprint_areas
where sprint_id = (select id from sprints where name = 'F2')
  and area_id in (select (jsonb_array_elements_text(details -> 'added_areas'))::uuid from schedule_changes where id = 4);

insert into schedule_changes (kind, sprint_id, summary, reason, details, actor_id)
values (
  'move_tickets',
  (select id from sprints where name = 'F1'),
  'T1 and F1 reopened (closed by mistake; they run to 30 Oct): 46 tickets back from T2 to F1, task 12 back to T1, 8 Engine areas taken off F2.',
  'Closed on 26 Oct by mistake.',
  jsonb_build_object('undoes', jsonb_build_array(4, 5)),
  (select id from people where lower(email) = 'parikshit.arora@vulqan.ai')
);
