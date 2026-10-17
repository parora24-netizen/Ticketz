-- Release dates as data (they move when sprints spill over), and a log of every schedule change.

create table release_settings (
  id int primary key default 1 check (id = 1),
  name text not null default '26.111',
  release_on date not null,
  go_no_go_on date not null,
  original_release_on date not null,
  updated_at timestamptz not null default now()
);
insert into release_settings (release_on, go_no_go_on, original_release_on)
values ('2026-12-04', '2026-12-03', '2026-12-04');

alter table release_settings enable row level security;
create policy read_release on release_settings for select using ((select is_member()));
create policy lead_release on release_settings for update using ((select has_role('{lead}'))) with check ((select has_role('{lead}')));

create type schedule_change_kind as enum ('extend_sprint', 'shift_release', 'spill_over', 'move_tickets', 'close_sprint');

create table schedule_changes (
  id bigint generated always as identity primary key,
  kind schedule_change_kind not null,
  sprint_id uuid references sprints on delete set null,
  summary text not null,               -- one line, written for people: "S2 extended 2 working days; S3–S11 shifted"
  reason text,
  details jsonb not null default '{}',
  actor_id uuid references people,
  at timestamptz not null default now()
);
create index schedule_changes_at on schedule_changes (at desc);

alter table schedule_changes enable row level security;
create policy read_schedule on schedule_changes for select using ((select is_member()));
create policy lead_schedule on schedule_changes for insert with check ((select has_role('{lead}')) and actor_id = (select current_person_id()));
