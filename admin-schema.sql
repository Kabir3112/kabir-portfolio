-- ============================================================
--  KABIR MEHTA PORTFOLIO — EDITABLE CONTENT SCHEMA
--  Run this in: Supabase → SQL Editor → Run
--
--  Adds the tables behind admin.html. Safe to re-run: every
--  create is `if not exists` and every seed is an upsert, so
--  running it twice will not duplicate or clobber your edits.
--
--  RUN THIS *AFTER* supabase.sql.
-- ============================================================


-- ============================================================
--  1. TABLES
-- ============================================================

-- One row per panel on the page. `sort_order` drives the running
-- order and the nav; `visible` hides a panel without deleting it.
--
-- `kind` tells the renderer what the panel is, because not every
-- panel is prose: the cards panels pull from projects/certificates
-- and the last two hold forms.
--   story | cards-projects | cards-certs | newsletter | contact
create table if not exists site_sections (
  id         uuid        primary key default gen_random_uuid(),
  key        text        not null unique,   -- matches the DOM id, e.g. 'finiq'
  kind       text        not null default 'story',
  nav_label  text        not null,
  meta       text,                          -- the small dateline above the title
  title      text        not null,
  role       text,                          -- role / qualification line
  tagline    text,
  body       text,                          -- markdown subset: paragraphs, - bullets, > quote
  theme      text        not null default 'dark',   -- dark | cream | green
  sort_order integer     not null default 0,
  visible    boolean     not null default true,
  updated_at timestamptz not null default now()
);

-- Loose key/value for everything that is not a panel: hero copy,
-- SEO tags, the CV link.
create table if not exists site_settings (
  key        text        primary key,
  value      text,
  updated_at timestamptz not null default now()
);

-- Design tokens. Each row becomes a CSS custom property on :root,
-- so `color-green-light` is applied as `--color-green-light`.
create table if not exists site_theme (
  key        text        primary key,
  value      text        not null,
  updated_at timestamptz not null default now()
);

-- Images, with their on-screen placement. The collage already
-- positions each photo from inline --x/--y/--w/--tilt custom
-- properties, so placement is genuinely just data.
--   placement: collage (the drifting polaroids) | gallery (thumbnail strip)
create table if not exists site_media (
  id          uuid        primary key default gen_random_uuid(),
  section_key text        not null,
  placement   text        not null default 'collage',
  image_url   text        not null,
  alt         text,
  caption     text,                            -- gallery captions only
  x           numeric     not null default 0,  -- % from left of the media box
  y           numeric     not null default 0,  -- % from top
  w           numeric     not null default 60, -- % width
  tilt        numeric     not null default 0,  -- degrees
  aspect      text        not null default '4/3',
  delay       numeric     not null default 0,  -- reveal delay, 0 to 1
  is_logo     boolean     not null default false,
  sort_order  integer     not null default 0,
  created_at  timestamptz not null default now()
);

create index if not exists site_media_section_idx on site_media (section_key, sort_order);

-- Makes the seed below idempotent. Without this, `on conflict do nothing`
-- has nothing to conflict on and re-running the file duplicates every photo.
create unique index if not exists site_media_unique_idx
  on site_media (section_key, placement, image_url);


-- ============================================================
--  2. ROW LEVEL SECURITY
--
--  The anon key is embedded in every visitor's browser — that is
--  how Supabase is designed to work, and it is why write access
--  can NEVER be granted to `anon`. Reads are public; writes
--  require a signed-in session belonging to the owner.
--
--  Set the owner email below before running.
-- ============================================================

alter table site_sections enable row level security;
alter table site_settings enable row level security;
alter table site_theme    enable row level security;
alter table site_media    enable row level security;

-- Anyone may read: this is the website's own content.
do $$
begin
  create policy "public read sections" on site_sections for select using (true);
  create policy "public read settings" on site_settings for select using (true);
  create policy "public read theme"    on site_theme    for select using (true);
  create policy "public read media"    on site_media    for select using (true);
exception when duplicate_object then null;
end $$;

-- Only the owner may write. auth.jwt() ->> 'email' is checked rather
-- than a hardcoded uuid so this file stays readable, and so it keeps
-- working if the account is ever recreated.
do $$
begin
  create policy "owner writes sections" on site_sections for all
    using      ((auth.jwt() ->> 'email') = 'kabirmehta3112@gmail.com')
    with check ((auth.jwt() ->> 'email') = 'kabirmehta3112@gmail.com');

  create policy "owner writes settings" on site_settings for all
    using      ((auth.jwt() ->> 'email') = 'kabirmehta3112@gmail.com')
    with check ((auth.jwt() ->> 'email') = 'kabirmehta3112@gmail.com');

  create policy "owner writes theme" on site_theme for all
    using      ((auth.jwt() ->> 'email') = 'kabirmehta3112@gmail.com')
    with check ((auth.jwt() ->> 'email') = 'kabirmehta3112@gmail.com');

  create policy "owner writes media" on site_media for all
    using      ((auth.jwt() ->> 'email') = 'kabirmehta3112@gmail.com')
    with check ((auth.jwt() ->> 'email') = 'kabirmehta3112@gmail.com');
exception when duplicate_object then null;
end $$;

-- The existing content tables are readable but not writable — the
-- admin needs to edit them too.
do $$
begin
  create policy "owner writes projects" on projects for all
    using      ((auth.jwt() ->> 'email') = 'kabirmehta3112@gmail.com')
    with check ((auth.jwt() ->> 'email') = 'kabirmehta3112@gmail.com');

  create policy "owner writes certificates" on certificates for all
    using      ((auth.jwt() ->> 'email') = 'kabirmehta3112@gmail.com')
    with check ((auth.jwt() ->> 'email') = 'kabirmehta3112@gmail.com');
exception when duplicate_object then null;
end $$;

-- Uploading images from the admin needs write access to the bucket.
do $$
begin
  create policy "owner writes assets" on storage.objects for all
    using      (bucket_id = 'Assets' and (auth.jwt() ->> 'email') = 'kabirmehta3112@gmail.com')
    with check (bucket_id = 'Assets' and (auth.jwt() ->> 'email') = 'kabirmehta3112@gmail.com');
exception when duplicate_object then null;
end $$;

-- Projects and certificates need a sort order the admin can drag.
alter table projects     add column if not exists sort_order integer not null default 0;
alter table certificates add column if not exists sort_order integer not null default 0;

-- `layout` picks the shape of a section built from the template:
--   text     — copy only
--   photos   — copy with the drifting polaroid collage
--   gallery  — copy with a thumbnail strip underneath
--   quote    — a full-width pull quote, no dateline or role line
-- Only meaningful for kind = 'story'. The bespoke sections ignore it.
alter table site_sections add column if not exists layout text not null default 'text';

-- Sections that came with the site rather than being created in the
-- editor. These can be hidden and reordered but not deleted: each one
-- holds markup the template cannot reproduce (a card grid bound to a
-- table, the newsletter form, the contact form). The editor reads this
-- to decide whether to offer Delete or Hide.
alter table site_sections add column if not exists is_builtin boolean not null default false;

update site_sections set is_builtin = true
  where key in ('projects', 'certificates', 'newsletter-section', 'contact');

-- The seeded story sections have their photos positioned by hand, so
-- they are collage layouts; Early Years also carries the thumbnail strip.
update site_sections set layout = 'photos'
  where key in ('christ', 'finiq', 'kings', 'personal') and layout = 'text';
update site_sections set layout = 'gallery'
  where key = 'childhood' and layout = 'text';


-- ============================================================
--  3. SEED — mirrors what is currently hardcoded in index.html
--
--  `on conflict do nothing` means this only fills empty tables.
--  Your later edits through the admin are never overwritten by
--  re-running this file.
-- ============================================================

insert into site_sections (key, kind, nav_label, meta, title, role, tagline, body, theme, sort_order) values

('projects', 'cards-projects', 'Projects',
 'Built things', 'Projects', null,
 'Things I''ve shipped, broken, and rebuilt.',
 null, 'dark', 30),

('certificates', 'cards-certs', 'Certificates',
 'Credentials', 'Certificates', null,
 null,
 null, 'cream', 20),

('childhood', 'story', 'Early Years',
 'New Delhi · 2001 to 2020', 'Early Years', null,
 'Started with abacus… upgraded to AI curiosity.',
 'Grew up in New Delhi and studied at Amity International School, Pushp Vihar. Took Commerce with Maths because numbers always made sense.

Went to abacus classes and picked up quite a few trophies early on (peak performance age: 12 to 15 😄). Skating and racquet sports too, and I can still play decently… after a warm-up and a reality check.

The tech obsession started with reading about Steve Jobs in middle school. Followed Apple, then the competitors, and kept going deeper. AI got serious during COVID, when there was finally time to explore, learn and take on remote internships.',
 'dark', 70),

('christ', 'story', 'Christ Uni',
 'Bengaluru, India · 2020 to 2023', 'Christ University', 'BCom · First Class Honours',
 'Commerce made sense. Finance made more.',
 'Chose Commerce because of family business exposure and a natural grip on maths and accounting. Explored sales through internships and tried marketing competitions, then moved toward finance for long-term growth.

- Finance & Accounting intern at Zoomcar
- Graduated First Class Honours, with a placement at FinIQ
- Audit Committee member: attention to detail and clean, accurate work',
 'cream', 60),

('finiq', 'story', 'FinIQ',
 'Bengaluru, India · Jun 2023 to Jul 2025', 'FinIQ', 'Product Application Consultant',
 'From testing systems to testing what I really want.',
 'Rewinding two years: FinIQ builds structured products platforms for banks globally, and I spent two years delivering them.

- Led delivery and testing of structured products across equity, credit, and FX
- Automated regression testing using SQL, which cut out a big chunk of manual effort
- Provided on-site support for a leading institutional digital bank in North America
- Collaborated with international clients across time zones

> Start small → plan well → iterate → scale.',
 'green', 50),

('kings', 'story', 'Now',
 'London, UK · Sep 2025 to Sep 2026', 'What I''m Doing Now', 'MSc Management and Technological Change · King''s College London',
 'When curiosity gets serious, you move cities.',
 'A year in London on the MSc, after two years building structured-products platforms in Bengaluru. I wanted global perspectives, a deeper understanding of tech transformation, and a head start on an AI-driven future. New people, new cultures, new experiences: that part needed no convincing.

- Change management & leadership in tech environments
- Design sprints & rapid prototyping
- Working across diverse, international teams',
 'green', 10),

('dissertation', 'story', 'Research',
 'Research · 2025 to 2026', 'Research', 'MSc dissertation · AI and authority in organisations',
 'AI is changing roles. I''m studying the humans in between.',
 'Working with a fintech firm, I''m finding that as AI tools spread, the people who master them fastest often become the ones colleagues turn to, earning real influence that doesn''t always match their job title.

- Interviews across roles and levels of seniority
- How managers respond when expertise shifts
- Qualitative research, stakeholder interviews, extensive literature review

The interest itself started at a desk in Bengaluru, where automating regression testing turned curiosity into something I wanted to pursue properly. Certified in AI Fluency: Foundation & Framework (Anthropic), and exploring AI tools daily since.',
 'cream', 40),

('personal', 'story', 'Personal',
 'Beyond the CV', 'Personal Side', null,
 'Organised… but not boring.',
 '- 🏎️ Huge Formula 1 fan (Red Bull supporter)
- 🎵 Music is constant: techno, house, rap, rock, Indian music, whatever fits the mood
- 📋 Love staying organised and planning ahead
- ⚡ But also enjoy small spontaneous moments. Keeps life interesting',
 'cream', 80),

('newsletter-section', 'newsletter', 'Newsletter',
 'Coming soon', 'AI Newsletter', null,
 'Weekly notes on what''s actually happening in AI.',
 'Register for early access now',
 'green', 90),

('contact', 'contact', 'Contact',
 'Get in touch', 'Let''s Connect', null,
 null,
 null, 'dark', 100)

on conflict (key) do nothing;


-- ── Section order, headings and themes ───────────────────────
-- The insert above is `on conflict do nothing`, so a database that was
-- seeded before this change keeps its old ordering. These updates are
-- idempotent and bring an existing install in line with the current
-- narrative order:
--   Now (King's) → Certificates → Projects → Research → FinIQ →
--   Christ → Early Years → Personal → Newsletter → Contact
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

-- The resume ships in the repo and is linked from the hero. site_settings
-- is seeded with `on conflict do nothing`, so an install that predates the
-- resume still holds an empty cv.url and would hide the button.
update site_settings set value = 'Kabir_Mehta_Resume.pdf' where key = 'cv.url';
update site_settings set value = 'Download Resume' where key = 'cv.label';
insert into site_settings (key, value) values
  ('cv.url', 'Kabir_Mehta_Resume.pdf'), ('cv.label', 'Download Resume')
on conflict (key) do nothing;


-- ── Hero, SEO and the CV link ────────────────────────────────
insert into site_settings (key, value) values
  ('hero.greeting',    'Hi, I''m'),
  ('hero.name',        'Kabir Mehta.'),
  ('hero.role',        'MSc Management & Technological Change · King''s College London'),
  ('hero.pitch',       'FinTech consultant turned AI-curious researcher. Two years delivering structured products for global banks, now in London researching how AI is reshaping who holds authority inside organisations. Below: where I am, and how I got here.'),
  ('hero.proof1',      '<strong>2 years</strong> FinTech delivery, Bengaluru & on-site North America'),
  ('hero.proof2',      '<strong>Equity · Credit · FX</strong> structured products'),
  ('hero.proof3',      '<strong>SQL automation</strong> that cut manual regression testing'),
  ('hero.quip1',       'They''re not staring…'),
  ('hero.quip2',       'they''re networking.'),
  ('hero.cta_primary', 'See my work'),
  ('hero.cta_contact', 'Get in touch'),
  ('hero.cta_story',   'Read my story'),
  ('hero.avatar_url',  'Avatar/face.webp'),

  ('cv.url',           'Kabir_Mehta_Resume.pdf'),
  ('cv.label',         'Download Resume'),

  ('contact.email',    'kabirmehta3112@gmail.com'),
  ('contact.linkedin', 'https://www.linkedin.com/in/kabir-mehta-49860619a'),
  ('contact.bubble',   'Hope to get in touch with you soon ✉️'),

  ('seo.title',        'Kabir Mehta | MSc King''s College London · FinTech & AI'),
  ('seo.description',  'Kabir Mehta — MSc Management & Technological Change at King''s College London. Two years delivering structured products at FinIQ. Researching how AI reshapes authority inside organisations.'),
  ('seo.og_image',     'images/avatar.png')
on conflict (key) do nothing;


-- ── Design tokens ────────────────────────────────────────────
--  Every key here is applied to :root as --<key>, so adding a row
--  is enough to make a new value themeable from the admin.
insert into site_theme (key, value) values
  ('color-dark',        '#111111'),
  ('color-cream',       '#edeade'),
  ('color-green',       '#1e3320'),
  ('color-green-light', '#7a9a6a'),

  ('font-serif',        '''Cormorant Garamond'', Georgia, serif'),
  ('font-sans',         '''DM Sans'', system-ui, sans-serif'),

  ('title-scale',       '1'),      -- multiplies every panel title
  ('body-scale',        '1'),      -- multiplies body copy
  ('hero-name-scale',   '1'),

  ('panel-pad-x',       '8vw'),
  ('panel-pad-y',       '8vh'),
  ('content-max',       '640px'),

  ('nav-alpha',         '0.58'),   -- side nav pill transparency
  ('card-alpha',        '0.04'),   -- project/cert card fill
  ('media-shadow',      '0.28'),   -- polaroid drop shadow strength

  ('dwell-vh',          '20')      -- scroll held per section; 0 disables
on conflict (key) do nothing;


-- ── Images and their placement ───────────────────────────────
--  x/y/w/tilt match the inline custom properties currently in
--  index.html, so the seeded layout is pixel-identical to today's.
insert into site_media (section_key, placement, image_url, alt, caption, x, y, w, tilt, aspect, delay, is_logo, sort_order) values
  ('childhood', 'collage', 'images/School.webp',      'Shelf of school trophies from Amity International School', null,  0,  2, 76, -3,   '16/9', 0,    false, 10),
  ('childhood', 'collage', 'images/AVTE.webp',        'Academic award trophies for maths, accounts and English', null, 26, 36, 62,  2.5, '4/3',  0.05, false, 20),
  ('childhood', 'collage', 'images/SteveJobs.webp',   'Steve Jobs holding an iPhone',                            null,  2, 66, 56, -2,   '9/8',  0.1,  false, 30),

  ('childhood', 'gallery', 'images/Olympiad.webp',    'Maths Olympiad medals',                                   'Olympiad medals',   0, 0, 0, 0, '1/1', 0, false, 10),
  ('childhood', 'gallery', 'images/Olympiad1.webp',   'International Olympiad of Mathematics certificate',        'IOM certificate',   0, 0, 0, 0, '1/1', 0, false, 20),
  ('childhood', 'gallery', 'images/BrainOBrain2.webp','Brainobrain national abacus champion certificate',         'Abacus champion',   0, 0, 0, 0, '1/1', 0, false, 30),
  ('childhood', 'gallery', 'images/Soccer.webp',      'Soccer academy medal',                                    'Soccer days',       0, 0, 0, 0, '1/1', 0, false, 40),
  ('childhood', 'gallery', 'images/Tennis.webp',      'Fort Knox tennis tournament certificate',                 'Tennis tournament', 0, 0, 0, 0, '1/1', 0, false, 50),

  ('christ',    'collage', 'images/Christ.webp',      'Christ University crest',            null, 20, 28, 52,  2,   '1/1',    0,    true,  10),
  ('finiq',     'collage', 'images/FinIQ.webp',       'FinIQ logo',                         null, 14, 32, 64, -2,   '2.2/1',  0,    true,  10),
  ('kings',     'collage', 'images/KCL.webp',         'King''s College London logo',        null, 16, 22, 58,  2.5, '1.85/1', 0,    true,  10),
  ('kings',     'collage', 'images/London.webp',      'London skyline',                     null, 10, 60, 62, -2,   '16/9',   0.06, false, 20),
  ('personal',  'collage', 'images/Redbull.webp',     'Red Bull Formula 1 car',             null,  0, 14, 74, -3,   '16/9',   0,    false, 10),
  ('personal',  'collage', 'images/fredagain.webp',   'Fred Again playing keys on a London rooftop', null, 24, 52, 66, 2.5, '3/2', 0.06, false, 20)
on conflict do nothing;


-- ============================================================
--  4. AFTER RUNNING THIS
--
--  1. Authentication → Users → Add user → create ONE user with
--     the email in the policies above. Confirm it.
--  2. Authentication → Providers → Email → turn OFF "Enable
--     signups". Without this, anyone can create an account —
--     though the email check above still blocks their writes.
--  3. Open admin.html and sign in.
-- ============================================================
