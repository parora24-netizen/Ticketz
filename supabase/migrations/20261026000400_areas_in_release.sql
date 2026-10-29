-- Zones can sit out a release: they leave Edit plan's grid (and its "Not planned" count) until
-- added back. Their pages and cases stay. Ask MAIA is out of 26.111 for now.
alter table areas add column in_release boolean not null default true;
update areas set in_release = false where zone = 'Ask MAIA';
