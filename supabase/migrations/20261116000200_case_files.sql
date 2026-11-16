-- Files kept on a test case: the datasets and inputs a test needs (MyLO datasets, zips, CSVs,
-- spreadsheets), or screenshots. A private bucket the team reads through short-lived links, and a
-- row per file saying who added it and when. The team adds files; the uploader or a lead removes one.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('case-files', 'case-files', false, 52428800, array[
  'application/zip', 'application/x-zip-compressed', 'application/x-zip', 'multipart/x-zip',
  'application/gzip', 'application/x-gzip', 'application/x-7z-compressed',
  'text/csv', 'text/tab-separated-values', 'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/json', 'text/plain', 'application/xml', 'text/xml', 'application/sql',
  'application/vnd.apache.parquet', 'application/octet-stream', 'application/pdf',
  'image/png', 'image/jpeg', 'image/gif', 'image/webp'])
on conflict (id) do nothing;

create policy case_files_read on storage.objects for select
  using (bucket_id = 'case-files' and (select public.is_member()));
create policy case_files_upload on storage.objects for insert
  with check (bucket_id = 'case-files' and (select public.has_role('{lead,qa,dev}')));

create table case_files (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references test_cases on delete cascade,
  path text not null unique,
  name text not null check (length(name) between 1 and 200),
  size_bytes bigint not null check (size_bytes >= 0),
  content_type text,
  uploaded_by uuid references people on delete set null,
  created_at timestamptz not null default now()
);
create index case_files_case on case_files (case_id, created_at);
alter table case_files enable row level security;
create policy case_files_rows_read on case_files for select using ((select is_member()));
create policy case_files_rows_add on case_files for insert
  with check (uploaded_by = (select current_person_id()) and (select has_role('{lead,qa,dev}')));
create policy case_files_rows_remove on case_files for delete
  using (uploaded_by = (select current_person_id()) or (select has_role('{lead}')));
