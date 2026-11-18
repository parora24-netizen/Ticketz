-- A tester for a ticket that has no test case (planned work, a bug raised by hand), so its retest
-- can go to someone other than whoever raised it. Tickets with a test case keep using the case's tester.
alter table tickets add column if not exists tester_id uuid references people on delete set null;
