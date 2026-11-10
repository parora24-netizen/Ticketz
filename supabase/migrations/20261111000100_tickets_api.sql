-- Tickets made and changed completely through the API: an accountable person beside the owner,
-- planned work (tasks) apart from defects, several cases and requirements per ticket, links, the
-- caller's own reference, scoped tokens, and history that names whoever made an API change.

-- Who made an API change. The API calls the database with the server key and names its token's
-- person in an x-launchpad-actor header; only the server key can, so a signed-in person never can.
create or replace function current_person_id() returns uuid
language sql stable security definer set search_path = public as $$
  select coalesce(
    (select id from people where active and lower(email) = lower(coalesce(auth.jwt() ->> 'email', ''))),
    case when current_setting('role', true) = 'service_role' then
      (select id from people where id::text = nullif(current_setting('request.headers', true), '')::json ->> 'x-launchpad-actor')
    end)
$$;

-- Planned work, counted apart from defects: TASK-<n>.
alter type ticket_kind add value if not exists 'task';
create sequence if not exists task_key_seq;
create or replace function next_ticket_key(prefix text) returns text
language sql as $$
  select prefix || '-' || nextval(case prefix when 'MM' then 'mm_key_seq' when 'TASK' then 'task_key_seq' else 'dev_key_seq' end::regclass)::text
$$;

alter table tickets
  add column accountable_id uuid references people on delete set null,  -- answers for it; the owner does the work
  add column priority text check (priority in ('Critical', 'High', 'Medium', 'Low')),  -- for planned work, apart from severity
  add column requirement_ids text[],
  add column external_ref text check (length(external_ref) between 1 and 200),
  add column created_via uuid references ci_tokens on delete set null;
-- The caller's own id for a ticket: posting it again updates that ticket rather than making another.
create unique index tickets_external_ref on tickets (created_via, external_ref) where external_ref is not null;

-- More cases than the one in case_id.
create table ticket_cases (
  ticket_id uuid not null references tickets on delete cascade,
  case_id uuid not null references test_cases on delete cascade,
  primary key (ticket_id, case_id)
);
create index ticket_cases_case on ticket_cases (case_id);

-- depends_on: this ticket waits on the other; related: see also; parent: the epic or feature it belongs to.
create table ticket_links (
  from_id uuid not null references tickets on delete cascade,
  to_id uuid not null references tickets on delete cascade,
  kind text not null check (kind in ('depends_on', 'related', 'parent')),
  primary key (from_id, to_id, kind),
  check (from_id <> to_id)
);
create index ticket_links_to on ticket_links (to_id);

alter table ticket_cases enable row level security;
alter table ticket_links enable row level security;
create policy ticket_cases_read on ticket_cases for select using ((select is_member()));
create policy ticket_links_read on ticket_links for select using ((select is_member()));

-- What each token may do. Runners create, comment and set automation fields; a person's token can
-- also change and assign tickets.
alter table ci_tokens add column scopes text[];
update ci_tokens set scopes = case role
  when 'runner' then array['read', 'create', 'comment', 'automation']
  else array['read', 'create', 'update', 'assign', 'comment'] end;
alter table ci_tokens alter column scopes set not null;
alter table ci_tokens add constraint ci_tokens_scopes check (scopes <@ array['read', 'create', 'update', 'assign', 'comment', 'automation']);
