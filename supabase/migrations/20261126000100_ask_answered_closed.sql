-- An ask is Open (its owner's move), Answered (the owner picked an outcome; whoever raised it checks)
-- or Closed (the raiser, usually the e2e runner, is satisfied). Sending it back reopens it.
-- The outcome "answered" (a reply in words) becomes "replied", so it does not read like the state.
-- resolved_at/resolved_by stay as when and by whom it was answered; closed_at/closed_by are new.

alter table asks drop constraint asks_state_check;
alter table asks drop constraint asks_outcome_check;
alter table asks disable trigger user;
update asks set state = 'closed' where state in ('done', 'declined');
update asks set outcome = 'replied' where outcome = 'answered';
alter table asks add column closed_at timestamptz, add column closed_by uuid references people on delete set null;
update asks set closed_at = resolved_at, closed_by = resolved_by where state = 'closed';
alter table asks enable trigger user;
alter table asks add constraint asks_state_check check (state in ('open', 'answered', 'closed'));
alter table asks add constraint asks_outcome_check check (outcome in ('edited', 'deferred', 'retired', 'manual', 'access', 'replied', 'duplicate'));

create or replace function asks_before() returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then new.key := 'ASK-' || new.num; end if;
  new.updated_at := now();
  if tg_op = 'UPDATE' and new.state is distinct from old.state then
    if new.state = 'open' then
      new.resolved_at := null; new.resolved_by := null; new.closed_at := null; new.closed_by := null;
    else
      if old.state = 'open' then
        new.resolved_at := now(); new.resolved_by := coalesce(current_person_id(), new.resolved_by);
      end if;
      if new.state = 'closed' then
        new.closed_at := now(); new.closed_by := coalesce(current_person_id(), new.closed_by);
      else
        new.closed_at := null; new.closed_by := null;
      end if;
    end if;
  end if;
  return new;
end $$;

-- The bell: an ask given to you; your ask answered; an answered ask sent back to you.
create or replace function notify_ask() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  actor uuid := current_person_id();
begin
  if new.owner_id is not null and new.owner_id is distinct from actor
     and (tg_op = 'INSERT' or new.owner_id is distinct from old.owner_id
          or (new.state = 'open' and old.state <> 'open'))
     and exists (select 1 from people where id = new.owner_id and active) then
    insert into notifications (person_id, kind, ask_id, actor_id, detail)
    values (new.owner_id, 'ask', new.id, actor, case when tg_op = 'UPDATE' and old.state <> 'open' and new.state = 'open' then 'Sent back: ' else '' end || new.title);
  end if;
  if tg_op = 'UPDATE' and new.state = 'answered' and old.state = 'open' and new.created_by is not null
     and new.created_by is distinct from actor and exists (select 1 from people where id = new.created_by and active) then
    insert into notifications (person_id, kind, ask_id, actor_id, detail) values (new.created_by, 'ask_answered', new.id, actor, coalesce(new.answer, new.title));
  end if;
  return null;
end $$;

-- Once every case an open ask waits on has been edited since it was raised, it is answered as edited.
create or replace function close_edited_asks() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.text_updated_at is not distinct from old.text_updated_at then return null; end if;
  update asks a set state = 'answered', outcome = 'edited', handed_from_id = null,
    answer = coalesce(a.answer, 'Every case it waited on was edited')
  where a.state = 'open' and a.suite_need is null
    and a.id in (select ask_id from ask_cases where case_id = new.id)
    and not exists (
      select 1 from ask_cases l join test_cases c on c.id = l.case_id
      where l.ask_id = a.id and c.retired_at is null and c.text_updated_at <= a.created_at);
  return null;
end $$;
