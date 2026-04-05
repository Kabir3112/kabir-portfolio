-- ============================================================
--  KABIR MEHTA PORTFOLIO — SUPABASE SCHEMA
--  Run this entire file in: Supabase → SQL Editor → Run
-- ============================================================


-- 1. PROJECTS
create table if not exists projects (
  id          uuid        primary key default gen_random_uuid(),
  title       text        not null,
  description text,
  image_url   text,
  project_url text,
  created_at  timestamptz default now()
);

-- 2. CERTIFICATES
create table if not exists certificates (
  id         uuid        primary key default gen_random_uuid(),
  title      text        not null,
  issuer     text,
  image_url  text,
  link       text,
  created_at timestamptz default now()
);

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
    'KBS Micro Internship — Jobago AI',
    'Student consultant on a 3-week industry project through King''s Business School. Researched megatrends relevant to Jobago AI — an AI-powered hiring and job-matching platform — and delivered strategic recommendations to the client.',
    null
  );

-- CERTIFICATES
insert into certificates (title, issuer, link) values
  ('AI Fluency: Foundation & Framework', 'Anthropic', null),
  ('Design Sprint', 'King''s College London', null),
  ('King''s Business School Micro Internship', 'King''s College London', null);

-- BADGES (add your own image_url and link once you have them)
insert into badges (title) values
  ('AI Fluency'),
  ('Design Sprint'),
  ('KBS Micro Intern');
