-- A recorded defect can fail several cases: defect_id on a ticket and on a result links them, and the
-- tickets API uses it to keep one ticket per defect. Cases get comments with @mentions, like tickets.

alter table tickets add column defect_id text check (length(trim(defect_id)) between 1 and 100);
create index tickets_defect on tickets (defect_id) where defect_id is not null;
alter table test_runs add column defect_id text check (length(trim(defect_id)) between 1 and 100);

-- ticket_list names its columns, so it is rebuilt to carry defect_id.
drop view ticket_list;
create view ticket_list with (security_invoker = on) as
select
  t.id, t.key, t.kind, t.case_id, t.title, t.description, t.severity, t.state, t.owner_id,
  t.found_in_sprint_id, t.current_sprint_id, t.fixed_in_build, t.defer_reason, t.duplicate_of,
  t.logged_on, t.created_by, t.updated_at, t.attachments, t.blocked_reason, t.blocked_at, t.defect_id,
  p.name as owner_name, c.tc_id, a.zone, a.page, a.id as area_id
from tickets t
left join people p on p.id = t.owner_id
left join test_cases c on c.id = t.case_id
left join areas a on a.id = coalesce(c.area_id, t.area_id);

-- A case's updated_at moves on every edit, so the API's updated_since sees edits made in the app.
create function touch_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
create trigger test_cases_touch before update on test_cases for each row execute function touch_updated_at();

-- Case comments ------------------------------------------------------------------------------
create table case_comments (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references test_cases on delete cascade,
  author_id uuid not null references people,
  body text not null check (length(trim(body)) between 1 and 5000),
  created_at timestamptz not null default now(),
  edited_at timestamptz
);
create index case_comments_case on case_comments (case_id, created_at);
alter table case_comments enable row level security;
create policy read_case_comments on case_comments for select using ((select is_member()));
create policy write_own_case_comment on case_comments for insert with check (author_id = (select current_person_id()));
create policy edit_own_case_comment on case_comments for update using (author_id = (select current_person_id()))
  with check (author_id = (select current_person_id()));

-- A notification is about a ticket or a case.
alter table notifications add column case_id uuid references test_cases on delete cascade;

-- @mentions notify those people; the case's tester hears about other comments on it.
create function notify_case_comment() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  tester uuid;
  snippet text := left(new.body, 200);
begin
  insert into notifications (person_id, kind, case_id, actor_id, detail)
  select m, 'mention', new.case_id, new.author_id, snippet
  from mentioned_people(new.body) m
  where m is distinct from new.author_id;

  select tester_id into tester from test_cases where id = new.case_id;
  if tester is not null and tester is distinct from new.author_id
     and tester not in (select mentioned_people(new.body)) then
    insert into notifications (person_id, kind, case_id, actor_id, detail)
    values (tester, 'comment', new.case_id, new.author_id, snippet);
  end if;
  return null;
end $$;
create trigger case_comments_notify after insert on case_comments for each row execute function notify_case_comment();
