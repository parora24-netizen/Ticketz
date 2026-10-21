-- Who uses Launchpad and what they change, for the lead's Admin → Activity screens.

-- Time in the app --------------------------------------------------------------------------
-- The app sends a ping a minute while it is open in a visible tab, and on each page change.
-- A gap of 30 minutes or more starts a new session.
create table presence_pings (
  id bigint generated always as identity primary key,
  person_id uuid not null default current_person_id() references people on delete cascade,
  path text not null check (length(path) <= 300),
  at timestamptz not null default now()
);
create index presence_pings_person on presence_pings (person_id, at);
alter table presence_pings enable row level security;
create policy own_pings_insert on presence_pings for insert with check (person_id = (select current_person_id()));
create policy lead_pings_read on presence_pings for select using ((select has_role('{lead}')));

create view presence_sessions with (security_invoker = on) as
with marked as (
  select person_id, at, path,
    case when lag(at) over w is null or at - lag(at) over w >= interval '30 minutes' then 1 else 0 end as starts
  from presence_pings
  window w as (partition by person_id order by at)
), numbered as (
  select *, sum(starts) over (partition by person_id order by at) as n from marked
)
select person_id, n as session_no, min(at) as started_at, max(at) as last_at,
  count(*)::int as pings, count(distinct path)::int as pages
from numbered
group by person_id, n;

-- Each person's last sign-in, from Supabase Auth (lead only).
create function last_sign_ins() returns table (person_id uuid, last_sign_in_at timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, u.last_sign_in_at
  from people p join auth.users u on lower(u.email) = lower(p.email)
  where has_role('{lead}')
$$;

-- Change log --------------------------------------------------------------------------------
-- Every insert, edit and delete on test cases, tickets, sprints and people: who, when, and
-- each changed field's value before and after. Written by the database, so imports and
-- scripts are logged too (with no actor).
create table change_log (
  id bigint generated always as identity primary key,
  table_name text not null,
  row_id uuid not null,
  label text,
  action text not null check (action in ('insert', 'update', 'delete')),
  changes jsonb not null default '{}',  -- {field: [before, after]}; on insert/delete, the row
  actor_id uuid references people on delete set null,
  at timestamptz not null default now()
);
create index change_log_at on change_log (at desc);
create index change_log_row on change_log (row_id, at desc);
create index change_log_actor on change_log (actor_id, at desc);
alter table change_log enable row level security;
create policy lead_changes_read on change_log for select using ((select has_role('{lead}')));

create function log_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  o jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  n jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  r jsonb := coalesce(n, o);
  diff jsonb;
begin
  if tg_op = 'UPDATE' then
    select coalesce(jsonb_object_agg(k, jsonb_build_array(o -> k, n -> k)), '{}') into diff
    from jsonb_object_keys(n) k
    where k not in ('updated_at') and (o -> k) is distinct from (n -> k);
    if diff = '{}' then return null; end if;
  else
    diff := r - 'updated_at';
  end if;
  insert into change_log (table_name, row_id, label, action, changes, actor_id)
  values (tg_table_name, (r ->> 'id')::uuid,
    coalesce(r ->> 'tc_id', r ->> 'key', r ->> 'name'), lower(tg_op), diff, current_person_id());
  return null;
end $$;

create trigger test_cases_change_log after insert or update or delete on test_cases for each row execute function log_change();
create trigger tickets_change_log after insert or update or delete on tickets for each row execute function log_change();
create trigger sprints_change_log after insert or update or delete on sprints for each row execute function log_change();
create trigger people_change_log after insert or update or delete on people for each row execute function log_change();
