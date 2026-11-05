-- Automation is due the Friday before a page's fix sprint, after the sprints were rearranged:
-- Logic Builder and Logic Store (S2, 16 Nov) by 13 Nov; Data Importer, Data Hub and Landing
-- (S3, 30 Nov) by 27 Nov; Data Exporter (S4, 14 Dec) by 11 Dec. A date someone set by hand stays.
update areas set automate_due_on = '2026-11-13' where zone in ('Logic Builder', 'Logic Store') and automate_due_on = '2026-11-27';
update areas set automate_due_on = '2026-11-27' where zone in ('Data Importer', 'Data Hub', 'Landing') and automate_due_on = '2026-11-13';
update areas set automate_due_on = '2026-12-11' where zone = 'Data Exporter' and automate_due_on = '2026-11-27';
