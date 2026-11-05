-- Automation is due the Friday before a page's fix sprint. The two-week sprints left two zones due
-- after their sprint starts: Data Importer and Data Hub (S2, from 16 Nov) and Data Exporter (S3, from 30 Nov).
-- A date someone has since set to anything else stays.
update areas set automate_due_on = '2026-11-13'
where zone in ('Data Importer', 'Data Hub') and automate_due_on = '2026-11-20';
update areas set automate_due_on = '2026-11-27'
where zone = 'Data Exporter' and automate_due_on = '2026-12-04';

-- This plan is the new baseline: any later slip is measured against 28 Dec.
update release_settings set original_release_on = release_on, updated_at = now() where id = 1;
