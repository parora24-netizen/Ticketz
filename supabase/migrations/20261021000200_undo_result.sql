-- QA and the lead can take back a manual result recorded by mistake (the app only offers the
-- latest one per case). Automated results come from CI and stay.
create policy qa_runs_delete on test_runs for delete
  using ((select has_role('{lead,qa}')) and kind = 'manual');
