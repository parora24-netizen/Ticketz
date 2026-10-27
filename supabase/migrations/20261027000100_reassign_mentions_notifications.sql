-- Developers can hand a ticket to anyone (e.g. back to QA); severity stays with lead and QA.
-- Comments can @mention people, and the app keeps notifications for each person.

-- Ticket rules, as in 20261017000200, without "a dev can only assign a ticket to themselves".
create or replace function tickets_guard() returns trigger
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
  if tg_op = 'UPDATE' and not trusted and actor_role = 'dev' and new.severity is distinct from old.severity then
    raise exception 'Only a lead or QA can change severity' using errcode = '42501';
  end if;
  return new;
end $$;

-- Notifications ------------------------------------------------------------------------------
create table notifications (
  id bigint generated always as identity primary key,
  person_id uuid not null references people on delete cascade,
  kind text not null check (kind in ('assigned', 'mention', 'comment', 'state')),
  ticket_id uuid references tickets on delete cascade,
  actor_id uuid references people on delete set null,
  detail text,
  created_at timestamptz not null default now(),
  read_at timestamptz
);
create index notifications_person on notifications (person_id, created_at desc);
alter table notifications enable row level security;
create policy own_notifications_read on notifications for select using (person_id = (select current_person_id()));
create policy own_notifications_update on notifications for update
  using (person_id = (select current_person_id())) with check (person_id = (select current_person_id()));

-- "@Niten" in a comment mentions Niten: an active person's name after @, not inside a longer word.
create function mentioned_people(body text) returns setof uuid
language sql stable security definer set search_path = public as $$
  select id from people
  where active and body ~* ('(^|[^[:alnum:]_])@' || regexp_replace(name, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g') || '([^[:alnum:]_]|$)')
$$;

create function notify_comment() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  owner uuid;
  snippet text := left(new.body, 200);
begin
  insert into notifications (person_id, kind, ticket_id, actor_id, detail)
  select m, 'mention', new.ticket_id, new.author_id, snippet
  from mentioned_people(new.body) m
  where m is distinct from new.author_id;

  select owner_id into owner from tickets where id = new.ticket_id;
  if owner is not null and owner is distinct from new.author_id
     and owner not in (select mentioned_people(new.body)) then
    insert into notifications (person_id, kind, ticket_id, actor_id, detail)
    values (owner, 'comment', new.ticket_id, new.author_id, snippet);
  end if;
  return null;
end $$;
create trigger ticket_comments_notify after insert on ticket_comments for each row execute function notify_comment();

create function notify_ticket() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  actor uuid := current_person_id();
begin
  if new.owner_id is not null and new.owner_id is distinct from actor
     and (tg_op = 'INSERT' or new.owner_id is distinct from old.owner_id) then
    insert into notifications (person_id, kind, ticket_id, actor_id, detail)
    values (new.owner_id, 'assigned', new.id, actor, new.title);
  end if;
  if tg_op = 'UPDATE' and new.state is distinct from old.state then
    insert into notifications (person_id, kind, ticket_id, actor_id, detail)
    select distinct p, 'state', new.id, actor, old.state::text || ' → ' || new.state::text
    from unnest(array[new.owner_id, new.created_by]) p
    where p is not null and p is distinct from actor;
  end if;
  return null;
end $$;
create trigger tickets_notify after insert or update on tickets for each row execute function notify_ticket();
