-- ============================================================
--  KABIR MEHTA PORTFOLIO — SUPABASE SCHEMA
--  Run this entire file in: Supabase → SQL Editor → Run
-- ============================================================


-- 1. PROJECTS
--    project_url     = live site       → "Visit Website" button
--    prototype_url   = Figma/v0/demo   → "View Prototype" button
--    certificate_url = PDF in Storage  → "View Certificate" + "Download PDF"
create table if not exists projects (
  id              uuid        primary key default gen_random_uuid(),
  title           text        not null,
  description     text,
  image_url       text,
  project_url     text,
  prototype_url   text,
  certificate_url text,
  created_at      timestamptz default now()
);

-- If your projects table already exists from an earlier run, add the columns.
-- These names must match EXPECTED_COLUMNS in app.js — if they drift, the
-- buttons silently disappear.
alter table projects add column if not exists prototype_url   text;
alter table projects add column if not exists certificate_url text;

-- 2. CERTIFICATES
--    pdf_url  = public Storage URL of the certificate PDF (View + Download buttons)
--    link     = optional issuer verification page, used only when pdf_url is empty
create table if not exists certificates (
  id         uuid        primary key default gen_random_uuid(),
  title      text        not null,
  issuer     text,
  image_url  text,
  pdf_url    text,
  link       text,
  created_at timestamptz default now()
);

-- If your certificates table already exists from an earlier run, add the column:
alter table certificates add column if not exists pdf_url text;

-- 3. BADGES
create table if not exists badges (
  id         uuid        primary key default gen_random_uuid(),
  title      text        not null,
  image_url  text,
  link       text,
  created_at timestamptz default now()
);

-- 4. MEDIA
create table if not exists media (
  id          uuid        primary key default gen_random_uuid(),
  image_url   text        not null,
  description text,
  created_at  timestamptz default now()
);

-- 5. NEWSLETTER SUBSCRIBERS
create table if not exists newsletter_subscribers (
  id         uuid        primary key default gen_random_uuid(),
  email      text        not null unique,
  created_at timestamptz default now()
);

-- 6. CONTACT SUBMISSIONS
create table if not exists contact_submissions (
  id         uuid        primary key default gen_random_uuid(),
  name       text        not null,
  email      text        not null,
  phone      text,
  reason     text,
  message    text        not null,
  created_at timestamptz default now()
);


-- ============================================================
--  ROW LEVEL SECURITY
-- ============================================================

alter table projects              enable row level security;
alter table certificates          enable row level security;
alter table badges                enable row level security;
alter table media                 enable row level security;
alter table newsletter_subscribers  enable row level security;
alter table contact_submissions     enable row level security;

-- Public: read content tables
create policy "Public read projects"      on projects      for select using (true);
create policy "Public read certificates"  on certificates  for select using (true);
create policy "Public read badges"        on badges        for select using (true);
create policy "Public read media"         on media         for select using (true);

-- Public: subscribe to newsletter (insert only, no read)
create policy "Public insert newsletter"  on newsletter_subscribers  for insert with check (true);

-- Public: submit contact form (insert only, no read)
create policy "Public insert contact"     on contact_submissions     for insert with check (true);


-- ============================================================
--  YOUR CONTENT — insert after tables are created
-- ============================================================

-- PROJECTS
insert into projects (title, description, project_url) values
  (
    'TicketSphere',
    'A digital ticketing platform designed and built during an intensive one-week design sprint at King''s Business School. Taken from concept to a live website and app prototype in five days. Awarded 2nd place for best website and app by students and industry panellists.',
    'https://v0-ticketsphere.vercel.app'
  ),
  (
    'KBS Micro Internship: Jobago AI',
    'Student consultant on a 3-week industry project through King''s Business School. Researched megatrends relevant to Jobago AI, an AI-powered hiring and job-matching platform, and delivered strategic recommendations to the client.',
    null
  );

-- CERTIFICATES
insert into certificates (title, issuer, link) values
  ('AI Fluency: Foundation & Framework', 'Anthropic', null),
  ('Design Sprint', 'King''s College London', null),
  ('King''s Business School Micro Internship', 'King''s College London', null);


-- ============================================================
--  LIVE URL WIRING
--
--  These match what is already in the database, verified working
--  (each PDF returns 200 application/pdf). They are written out in
--  full rather than as <project-ref> placeholders so that re-running
--  this file restores the working state instead of clobbering it.
--
--  Files live in the `Assets` bucket under certificates/ and badges/.
-- ============================================================

-- Certificates — all three already applied.
update certificates set pdf_url =
  'https://gnfqwqiegsdralfxzymn.supabase.co/storage/v1/object/public/Assets/certificates/anthropic-ai-fluency.pdf'
  where title = 'AI Fluency: Foundation & Framework';

update certificates set pdf_url =
  'https://gnfqwqiegsdralfxzymn.supabase.co/storage/v1/object/public/Assets/certificates/design-sprint.pdf'
  where title = 'Design Sprint';

update certificates set pdf_url =
  'https://gnfqwqiegsdralfxzymn.supabase.co/storage/v1/object/public/Assets/certificates/kbs-micro-internship.pdf'
  where title = 'King''s Business School Micro Internship';

-- TicketSphere — already applied.
update projects set prototype_url = 'https://ticketsphere.figma.site'
  where title = 'TicketSphere';

-- The micro internship has no build to visit, only its certificate.
-- NOTE: the live row's title uses an em dash (—), not a colon. A `where`
-- clause with the wrong character silently matches zero rows and the
-- button never appears.
update projects set certificate_url =
  'https://gnfqwqiegsdralfxzymn.supabase.co/storage/v1/object/public/Assets/certificates/kbs-micro-internship.pdf'
  where title = 'KBS Micro Internship — Jobago AI';


-- ============================================================
--  STORAGE — public bucket for certificate PDFs and badges
-- ============================================================

-- The live bucket is `Assets`, already public and serving files.
-- This is idempotent, so it is safe to re-run.
insert into storage.buckets (id, name, public)
  values ('Assets', 'Assets', true)
  on conflict (id) do update set public = true;

do $$
begin
  create policy "Public read assets"
    on storage.objects for select
    using (bucket_id = 'Assets');
exception when duplicate_object then
  null;  -- policy already exists
end $$;

-- BADGES (add your own image_url and link once you have them)
insert into badges (title) values
  ('AI Fluency'),
  ('Design Sprint'),
  ('KBS Micro Intern');
