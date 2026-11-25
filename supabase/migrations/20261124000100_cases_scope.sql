-- A "cases" scope for API tokens: edit a test case's text, add test cases, and retire or defer them.
-- No token has it by default; a lead grants it to the tokens they choose.
alter table ci_tokens drop constraint ci_tokens_scopes;
alter table ci_tokens add constraint ci_tokens_scopes
  check (scopes <@ array['read', 'create', 'update', 'assign', 'comment', 'automation', 'cases']);
