-- A blocked ticket says which ask it waits on. Blocking links the ask by itself: the open ask
-- raised on this ticket, else the newest open ask on its test case, else one the reason names
-- (ASK-12). When that ask is answered or closed, the ticket is unblocked with a comment.

alter table tickets add column blocked_ask_id uuid references asks on delete set null;
create index tickets_blocked_ask on tickets (blocked_ask_id) where blocked_ask_id is not null;

create function ticket_block_ask() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.blocked_reason is null then
    new.blocked_ask_id := null;
  elsif new.blocked_ask_id is null then
    select k.id into new.blocked_ask_id from asks k
    where k.state = 'open' and (
      k.ticket_id = new.id
      or (new.case_id is not null and k.id in (select ask_id from ask_cases where case_id = new.case_id))
      or k.key = substring(new.blocked_reason from 'ASK-[0-9]+'))
    order by (k.ticket_id = new.id) desc nulls last, k.num desc
    limit 1;
  end if;
  return new;
end $$;
create trigger tickets_block_ask before insert or update of blocked_reason, blocked_ask_id on tickets
  for each row execute function ticket_block_ask();

-- An answered (or closed) ask unblocks the tickets waiting on it.
create function unblock_on_ask() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  who uuid := coalesce(current_person_id(), new.resolved_by, new.owner_id, new.created_by);
  r record;
begin
  if new.state = 'open' or old.state <> 'open' then return null; end if;
  for r in select id from tickets where blocked_ask_id = new.id loop
    update tickets set blocked_reason = null, blocked_at = null, blocked_ask_id = null where id = r.id;
    if who is not null then
      insert into ticket_comments (ticket_id, author_id, body)
      values (r.id, who, 'Unblocked: ' || new.key || ' was answered (' || coalesce(new.outcome, 'replied') || ')' ||
        coalesce(': ' || left(new.answer, 500), '') || '. Pick this up again.');
    end if;
  end loop;
  return null;
end $$;
create trigger asks_unblock_tickets after update of state on asks for each row execute function unblock_on_ask();

-- The ticket list carries the ask a blocked ticket waits on.
create or replace view ticket_list with (security_invoker = on) as
select
  t.id, t.key, t.kind, t.case_id, t.title, t.description, t.severity, t.state, t.owner_id,
  t.found_in_sprint_id, t.current_sprint_id, t.fixed_in_build, t.defer_reason, t.duplicate_of,
  t.logged_on, t.created_by, t.updated_at, t.attachments, t.blocked_reason, t.blocked_at, t.defect_id,
  p.name as owner_name, c.tc_id, a.zone, a.page, a.id as area_id, t.legacy_key,
  coalesce(t.tester_id, c.tester_id) as tester_id, tp.name as tester_name, t.tester_id as own_tester_id, t.focus,
  t.blocked_ask_id, bk.key as blocked_ask
from tickets t
left join people p on p.id = t.owner_id
left join test_cases c on c.id = t.case_id
left join areas a on a.id = coalesce(c.area_id, t.area_id)
left join people tp on tp.id = coalesce(t.tester_id, c.tester_id)
left join asks bk on bk.id = t.blocked_ask_id;

-- Link the tickets already blocked: touching blocked_ask_id runs the trigger above.
update tickets set blocked_ask_id = null
where blocked_reason is not null and state not in ('closed', 'deferred', 'duplicate');
