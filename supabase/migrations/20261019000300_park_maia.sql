-- Still planning: the S0 date move is not a schedule change worth logging.
delete from schedule_changes where kind = 'extend_sprint' and details ->> 'added' = 'S0';

-- Data MAIA and Ask MAIA come out of this release plan for now (to be added back later).
-- Their areas stay, so they can be put back into a sprint; only the sprints and links go.
delete from sprint_areas
where area_id in (select id from areas where zone in ('Data MAIA', 'Ask MAIA'));
delete from sprints
where status = 'planned' and name in ('S8', 'S10')
  and not exists (select 1 from sprint_areas sa where sa.sprint_id = sprints.id);
