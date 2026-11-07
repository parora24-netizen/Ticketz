-- A sprint can be owned by everyone rather than one person, as regression is.
alter table sprints add column owner_all boolean not null default false;
update sprints set owner_all = true, owner_id = null where name = 'S5';
