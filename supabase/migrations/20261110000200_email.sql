-- Email from Launchpad (through Resend): an ask given to you, an answer to an ask you raised, and a
-- weekday morning digest of what waits on you. Off for the team until the lead turns it on; each
-- person can turn either kind off for themselves.

alter table people
  add column email_notify boolean not null default true,  -- asks given to me, answers to mine
  add column email_digest boolean not null default true;  -- the weekday morning digest

create table app_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references people on delete set null,
  updated_at timestamptz not null default now()
);
alter table app_settings enable row level security;
create policy app_settings_read on app_settings for select using ((select is_member()));
create policy app_settings_lead on app_settings for all using ((select has_role('{lead}'))) with check ((select has_role('{lead}')));
insert into app_settings (key, value) values ('email', '{"live": false}');

-- Every email sent or attempted. A digest is sent once per person per day (ref = the date).
create table email_log (
  id bigint generated always as identity primary key,
  person_id uuid references people on delete cascade,
  kind text not null check (kind in ('ask', 'ask_answered', 'digest', 'test')),
  ref text,
  subject text not null,
  status text not null check (status in ('sent', 'failed')),
  error text,
  provider_id text,
  at timestamptz not null default now()
);
create unique index email_log_once on email_log (person_id, kind, ref) where status = 'sent' and kind = 'digest';
create index email_log_at on email_log (at desc);
alter table email_log enable row level security;
create policy email_log_lead on email_log for select using ((select has_role('{lead}')));
