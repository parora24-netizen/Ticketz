-- What an ask's owner can do with it. A closed ask has one outcome, whatever its kind:
--   edited     the cases were rewritten          deferred  the cases are deferred for now
--   retired    the cases left the suite          manual    the cases stay, tested by hand only
--   access     a login, server or mailbox was set up
--   answered   a reply in words, nothing else changed
--   duplicate  another ask covers it (its cases moved there)
-- An open ask can wait on a suite change (suite_need says what the suite cannot do yet), and can be
-- handed to someone until they reply (handed_from_id is who gets it back). Asks get comments.

alter table asks drop constraint asks_outcome_check;
update asks set outcome = case outcome when 'retire' then 'manual' when 'rewrite' then 'edited' else 'answered' end where outcome is not null;
update asks set outcome = case kind when 'need' then 'access' else 'answered' end where state <> 'open' and outcome is null;
update asks set state = 'done' where state = 'declined';
alter table asks add constraint asks_outcome_check check (outcome in ('edited', 'deferred', 'retired', 'manual', 'access', 'answered', 'duplicate'));
alter table asks add constraint asks_outcome_closed check ((state = 'open') = (outcome is null)) not valid;
update asks set outcome = null where state = 'open';
alter table asks validate constraint asks_outcome_closed;

alter table asks
  add column suite_need text check (length(trim(suite_need)) between 1 and 2000),
  add column handed_from_id uuid references people on delete set null,
  add column duplicate_of uuid references asks on delete set null;

-- Who owns the asks that wait on a suite change: the person who keeps the e2e suite.
insert into app_settings (key, value)
select 'suite_owner', jsonb_build_object('person', id) from people where name = 'Juan' and active limit 1
on conflict (key) do nothing;

-- Comments on an ask; @Name tags a person.
create table ask_comments (
  id uuid primary key default gen_random_uuid(),
  ask_id uuid not null references asks on delete cascade,
  author_id uuid not null references people,
  body text not null check (length(trim(body)) between 1 and 5000),
  created_at timestamptz not null default now()
);
create index ask_comments_ask on ask_comments (ask_id, created_at);
alter table ask_comments enable row level security;
create policy ask_comments_read on ask_comments for select using ((select is_member()));
create policy ask_comments_write on ask_comments for insert with check ((select is_member()) and author_id = (select current_person_id()));
create trigger ask_comments_change_log after insert or update or delete on ask_comments for each row execute function log_change();

-- Tagged people are notified; the ask's owner hears about the other comments on it.
create function notify_ask_comment() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  owner uuid;
  snippet text := left(new.body, 200);
begin
  insert into notifications (person_id, kind, ask_id, actor_id, detail)
  select m, 'mention', new.ask_id, new.author_id, snippet
  from mentioned_people(new.body) m
  where m is distinct from new.author_id;

  select owner_id into owner from asks where id = new.ask_id;
  if owner is not null and owner is distinct from new.author_id
     and owner not in (select mentioned_people(new.body)) then
    insert into notifications (person_id, kind, ask_id, actor_id, detail)
    values (owner, 'comment', new.ask_id, new.author_id, snippet);
  end if;
  return null;
end $$;
create trigger ask_comments_notify after insert on ask_comments for each row execute function notify_ask_comment();

-- A comment moves the ask's updated_at, so the runner's updated_since sees it.
create function touch_ask_on_comment() returns trigger language plpgsql security definer set search_path = public as $$
begin
  update asks set updated_at = now() where id = new.ask_id;
  return null;
end $$;
create trigger ask_comments_touch after insert on ask_comments for each row execute function touch_ask_on_comment();

-- Once every case an open ask waits on has been edited since it was raised, it closes as edited.
create function close_edited_asks() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.text_updated_at is not distinct from old.text_updated_at then return null; end if;
  update asks a set state = 'done', outcome = 'edited', handed_from_id = null,
    answer = coalesce(a.answer, 'Every case it waited on was edited')
  where a.state = 'open' and a.suite_need is null
    and a.id in (select ask_id from ask_cases where case_id = new.id)
    and not exists (
      select 1 from ask_cases l join test_cases c on c.id = l.case_id
      where l.ask_id = a.id and c.retired_at is null and c.text_updated_at <= a.created_at);
  return null;
end $$;
create trigger test_cases_close_edited_asks after update on test_cases for each row execute function close_edited_asks();

alter table email_log drop constraint email_log_kind_check;
alter table email_log add constraint email_log_kind_check check (kind in ('ask', 'ask_answered', 'ask_mention', 'digest', 'test'));
