-- Close the 29 Engine mismatches raised today (MM-44 to MM-72): automation failed but the manual test
-- passed, so the lead treats them as problems with the automated tests, not product bugs. Each one
-- says why. Only tickets still New are touched, and a later failure of the same test reopens them.
with closing as (
  update tickets t
  set state = 'closed'
  where t.kind = 'test_mismatch' and t.state = 'new'
    and t.key ~ '^MM-[0-9]+$' and substring(t.key from 4)::int between 44 and 72
  returning t.id
)
insert into ticket_comments (ticket_id, author_id, body)
select c.id, (select id from people where email = 'ci@launchpad.invalid'),
  'Closed by the lead: the manual test passed, so this is treated as a problem with the automated test rather than a product bug.'
from closing c;
