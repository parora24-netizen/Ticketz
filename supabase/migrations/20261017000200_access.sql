-- Who can see and change what. Only people listed in `people` (matched on their sign-in email)
-- can read anything; writes depend on role. The service-role key (CI results API, import script)
-- bypasses RLS; the ticket trigger treats a call with no signed-in user as that trusted path.

create function current_person_id() returns uuid
language sql stable security definer set search_path = public as $$
  select id from people
  where active and lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
$$;

create function current_person_role() returns person_role
language sql stable security definer set search_path = public as $$
  select role from people
  where active and lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))
$$;

create function is_member() returns boolean
language sql stable as $$ select current_person_id() is not null $$;

create function has_role(roles person_role[]) returns boolean
language sql stable as $$ select coalesce(current_person_role() = any(roles), false) $$;

-- Ticket rules: state changes follow ticket_transitions for the actor's role, required fields
-- for each state, and only lead/qa may change severity or reassign (a dev may take a ticket).
create function tickets_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  actor_role person_role := current_person_role();
  trusted boolean := auth.uid() is null;
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' and new.state is distinct from old.state and not trusted then
    if actor_role is null or not exists (
      select 1 from ticket_transitions
      where from_state = old.state and to_state = new.state and role = actor_role
    ) then
      raise exception 'A % cannot move a ticket from % to %', coalesce(actor_role::text, 'non-member'), old.state, new.state
        using errcode = '42501';
    end if;
  end if;
  if new.state = 'ready_for_retest' and coalesce(trim(new.fixed_in_build), '') = '' then
    raise exception 'Ready for retest needs the build the fix is in' using errcode = '23514';
  end if;
  if new.state = 'deferred' and coalesce(trim(new.defer_reason), '') = '' then
    raise exception 'Deferring needs a reason' using errcode = '23514';
  end if;
  if new.state = 'duplicate' and new.duplicate_of is null then
    raise exception 'Duplicate needs the ticket it duplicates' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and not trusted and actor_role = 'dev' then
    if new.severity is distinct from old.severity then
      raise exception 'Only a lead or QA can change severity' using errcode = '42501';
    end if;
    if new.owner_id is distinct from old.owner_id and new.owner_id is distinct from current_person_id() then
      raise exception 'A dev can only assign a ticket to themselves' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;

create trigger tickets_guard before insert or update on tickets
for each row execute function tickets_guard();

create function tickets_log() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    insert into ticket_events (ticket_id, from_state, to_state, note, actor_id)
    values (new.id, null, new.state, 'Created', current_person_id());
  elsif new.state is distinct from old.state then
    insert into ticket_events (ticket_id, from_state, to_state, note, actor_id)
    values (new.id, old.state, new.state,
            case new.state
              when 'ready_for_retest' then 'Fixed in ' || new.fixed_in_build
              when 'deferred' then new.defer_reason
              else null end,
            current_person_id());
  elsif new.owner_id is distinct from old.owner_id then
    insert into ticket_events (ticket_id, from_state, to_state, note, actor_id)
    values (new.id, new.state, new.state,
            'Owner: ' || coalesce((select name from people where id = new.owner_id), 'none'),
            current_person_id());
  end if;
  return new;
end $$;

create trigger tickets_log after insert or update on tickets
for each row execute function tickets_log();

alter table people enable row level security;
alter table areas enable row level security;
alter table sprints enable row level security;
alter table sprint_areas enable row level security;
alter table test_cases enable row level security;
alter table test_runs enable row level security;
alter table tickets enable row level security;
alter table ticket_events enable row level security;
alter table ticket_transitions enable row level security;
alter table plan_tasks enable row level security;
alter table ci_tokens enable row level security;

-- Everyone on the team reads everything except CI tokens.
create policy read_people on people for select using (is_member());
create policy read_areas on areas for select using (is_member());
create policy read_sprints on sprints for select using (is_member());
create policy read_sprint_areas on sprint_areas for select using (is_member());
create policy read_cases on test_cases for select using (is_member());
create policy read_runs on test_runs for select using (is_member());
create policy read_tickets on tickets for select using (is_member());
create policy read_events on ticket_events for select using (is_member());
create policy read_transitions on ticket_transitions for select using (is_member());
create policy read_tasks on plan_tasks for select using (is_member());

-- Lead manages the team, the framework, sprints and CI tokens.
create policy lead_people on people for all using (has_role('{lead}')) with check (has_role('{lead}'));
create policy lead_areas on areas for all using (has_role('{lead}')) with check (has_role('{lead}'));
create policy lead_sprints on sprints for all using (has_role('{lead}')) with check (has_role('{lead}'));
create policy lead_sprint_areas on sprint_areas for all using (has_role('{lead}')) with check (has_role('{lead}'));
create policy lead_tokens on ci_tokens for all using (has_role('{lead}')) with check (has_role('{lead}'));

-- QA and lead write test cases and record manual results.
create policy qa_cases_insert on test_cases for insert with check (has_role('{lead,qa}'));
create policy qa_cases_update on test_cases for update using (has_role('{lead,qa}')) with check (has_role('{lead,qa}'));
create policy qa_runs_insert on test_runs for insert
  with check (has_role('{lead,qa}') and kind = 'manual' and recorded_by = current_person_id());

-- Anyone on the team can raise a ticket and update one; the trigger enforces who may do what.
create policy member_tickets_insert on tickets for insert with check (is_member());
create policy member_tickets_update on tickets for update using (is_member()) with check (is_member());

-- Anyone can move a plan task along; only the lead adds or removes tasks.
create policy member_tasks_update on plan_tasks for update using (is_member()) with check (is_member());
create policy lead_tasks_write on plan_tasks for insert with check (has_role('{lead}'));
create policy lead_tasks_delete on plan_tasks for delete using (has_role('{lead}'));
