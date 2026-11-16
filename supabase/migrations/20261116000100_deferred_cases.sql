-- A case taken out of the release is either retired (gone for good) or deferred (out of this release,
-- expected back in a later one). Both leave case_latest, so both leave every list, board and count.
alter table test_cases
  add column if not exists retired_as text check (retired_as in ('retired', 'deferred'));

update test_cases set retired_as = 'retired' where retired_at is not null and retired_as is null;
