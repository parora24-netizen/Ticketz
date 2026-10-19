-- Screenshots (or PDFs) a tester attaches to a result. Files live in a private bucket; the team
-- reads them through short-lived signed links, QA and the lead upload.
alter table test_runs add column attachments text[] not null default '{}';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('evidence', 'evidence', false, 10485760, array['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

create policy evidence_read on storage.objects for select
  using (bucket_id = 'evidence' and (select public.is_member()));
create policy evidence_upload on storage.objects for insert
  with check (bucket_id = 'evidence' and (select public.has_role('{lead,qa}')));
