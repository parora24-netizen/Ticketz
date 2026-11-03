-- A token can act as a person (e.g. Sara raising tickets from her own tooling): what it raises and
-- comments is credited to them. Tokens without one act as CI.
alter table ci_tokens add column person_id uuid references people on delete set null;
