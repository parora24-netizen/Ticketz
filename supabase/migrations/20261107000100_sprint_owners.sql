-- Each sprint can have an owner, the person answerable for it.
alter table sprints add column owner_id uuid references people on delete set null;

update sprints s set owner_id = p.id
from people p
where (s.name, p.name) in (('S1', 'Niten'), ('S2', 'Sara'), ('S3', 'Niten'), ('S4', 'Niten'));
