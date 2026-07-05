# Setup — 3 quick steps

## Step 1 — Add photos

Drop any photos you want to use into the `images/` folder, then reference them from `index.html` (or wire them into a timeline section's markup/CSS).

---

## Step 2 — Create your config file

The site reads Supabase credentials from `config.js`, which is **gitignored and never committed**.

1. Copy the template:
   ```bash
   cp config.example.js config.js
   ```
2. Open `config.js` and fill in your values:
   ```js
   window.SUPABASE_URL      = 'https://your-project-ref.supabase.co';
   window.SUPABASE_ANON_KEY = 'your-anon-key-here';
   ```
3. Find these values at **supabase.com → your project → Settings → API**.

> `config.js` and `.env` are listed in `.gitignore` — they will never be committed to git.
> `.env` mirrors these values in standard env-file format for reference.

---

## Step 3 — Supabase

1. Go to your Supabase project → **SQL Editor**
2. Paste the full contents of `supabase.sql` and click **Run**
3. Your tables are ready. Add content via **Table Editor** → insert rows.

### Adding content

| Table | Key columns |
|-------|-------------|
| `projects` | title, description, image_url, project_url |
| `certificates` | title, issuer, image_url, link |
| `badges` | title, image_url, link |
| `media` | image_url, description |

> For images, upload to Supabase Storage (or any host) and paste the public URL.

---

## Deploy to Netlify

When you drag-and-drop to **[netlify.com/drop](https://netlify.com/drop)**, include `config.js` in the folder — it's gitignored (not in the repo) but must be present for the site to connect to Supabase.

Done. Your site is live.

---

## Editing about text

Open `index.html` and find `#introAboutPara` inside the `intro-about` section, then replace the paragraph text with your own content.

---

## Using with Claude Code

Open the `kabir-portfolio/` folder in Claude Code. The `.claude/` directory contains launch configuration. Run the dev server with:

```bash
claude
```

Claude Code will read the project context and assist with edits. Your secrets stay local in `config.js` and `.env` — neither is committed.
