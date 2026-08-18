-- ============================================================
--  OPTIONAL. You probably do not need to run this.
--
--  Read this first:
--
--  The site does NOT need any database to show the current section
--  order and headings. Those live in index.html, and site-content.js
--  falls back to that markup whenever the tables are missing or
--  Supabase is unreachable. If you have never run admin-schema.sql,
--  the site is already correct and there is nothing to do here.
--
--  This file only matters if BOTH are true:
--    1. you have run admin-schema.sql (so the tables exist), AND
--    2. you ran an older copy of it that seeded the previous order
--       (Projects first, headings "Work" and "King's College London")
--
--  The seed in admin-schema.sql is `on conflict (key) do nothing`, so
--  it skips rows that already exist and cannot correct an install
--  seeded from the older version. These plain updates can.
--
--  Running admin-schema.sql fresh already seeds the current order, so
--  in that case this file is a harmless no-op.
--
--  Safe to run in any state: the guard below skips everything if the
--  tables do not exist, instead of failing with
--  "relation site_sections does not exist".
-- ============================================================


do $$
begin
  if to_regclass('public.site_sections') is null then
    raise notice 'site_sections not found - schema has not been run. Nothing to migrate, and the site does not need it.';
  else
    -- Order: Now (King's) -> Certificates -> Projects -> Research ->
    -- FinIQ -> Christ -> Early Years -> Personal -> Newsletter -> Contact
    --
    -- Themes alternate so no two adjacent panels share a background,
    -- and the card panels keep the background their card styling
    -- expects (certificates light, projects dark).
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
    raise notice 'site_sections updated.';
  end if;

  if to_regclass('public.site_settings') is null then
    raise notice 'site_settings not found - skipping resume settings.';
  else
    -- The resume ships in the repo and is linked from the hero markup.
    -- An install that predates it holds an empty cv.url, which would
    -- hide the button.
    update site_settings set value = 'Kabir_Mehta_Resume.pdf' where key = 'cv.url';
    update site_settings set value = 'Download Resume'        where key = 'cv.label';
    insert into site_settings (key, value) values
      ('cv.url',   'Kabir_Mehta_Resume.pdf'),
      ('cv.label', 'Download Resume')
    on conflict (key) do nothing;
    raise notice 'site_settings updated.';
  end if;
end $$;


-- To see the result (only works once the tables exist):
--
--   select sort_order, key, nav_label, title, theme
--     from site_sections
--    order by sort_order;
