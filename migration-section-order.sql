-- ============================================================
--  RUN THIS ONCE in the Supabase SQL editor.
--
--  Why it is needed:
--  site-content.js reads site_sections from the database and then
--  re-sorts the page and overwrites every heading and nav label with
--  what it finds there. So editing index.html alone is not enough —
--  whenever Supabase is reachable, the database wins and the page
--  snaps back to the old order and the old headings ("Work",
--  "King's College London").
--
--  The seed block in admin-schema.sql is `on conflict (key) do
--  nothing`, which means it skips rows that already exist. An
--  already-seeded project therefore keeps its old values. These
--  statements are plain updates, so they apply to an existing
--  install. They are idempotent — running twice is harmless.
--
--  (These same statements are already included in admin-schema.sql.
--  This file is just the standalone copy, so you do not have to
--  re-run the whole schema.)
-- ============================================================


-- ── Section order, headings and themes ───────────────────────
--   Now (King's) → Certificates → Projects → Research → FinIQ →
--   Christ → Early Years → Personal → Newsletter → Contact
--
-- Themes alternate so no two adjacent panels share a background, and
-- the card panels keep the background their card styling expects
-- (certificates light, projects dark).

update site_sections set sort_order =  10, theme = 'green', nav_label = 'Now',
       title = 'What I''m Doing Now',
       role  = 'MSc Management and Technological Change · King''s College London'
  where key = 'kings';
update site_sections set sort_order =  20, theme = 'cream'  where key = 'certificates';
update site_sections set sort_order =  30, theme = 'dark',
       nav_label = 'Projects', title = 'Projects'           where key = 'projects';
update site_sections set sort_order =  40, theme = 'cream'  where key = 'dissertation';
update site_sections set sort_order =  50, theme = 'green'  where key = 'finiq';
update site_sections set sort_order =  60, theme = 'cream'  where key = 'christ';
update site_sections set sort_order =  70, theme = 'dark'   where key = 'childhood';
update site_sections set sort_order =  80, theme = 'cream'  where key = 'personal';
update site_sections set sort_order =  90, theme = 'green'  where key = 'newsletter-section';
update site_sections set sort_order = 100, theme = 'dark'   where key = 'contact';


-- ── Resume download button ───────────────────────────────────
-- The resume ships in the repo and is linked from the hero markup.
-- An install that predates it still holds an empty cv.url, which
-- would hide the button.

update site_settings set value = 'Kabir_Mehta_Resume.pdf' where key = 'cv.url';
update site_settings set value = 'Download Resume'        where key = 'cv.label';
insert into site_settings (key, value) values
  ('cv.url',   'Kabir_Mehta_Resume.pdf'),
  ('cv.label', 'Download Resume')
on conflict (key) do nothing;


-- ── Check the result ─────────────────────────────────────────
select sort_order, key, nav_label, title, theme
  from site_sections
 order by sort_order;
