# Setup — 3 quick steps

## Step 1 — Add your profile photo

Copy your photo into the `images/` folder and name it `profile.png`.

---

## Step 2 — Supabase

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

## Step 3 — Netlify

Go to **[netlify.com/drop](https://netlify.com/drop)** and drag the entire `kabir-portfolio` folder onto the page.

Done. Your site is live.

---

## Editing about text

Open `index.html` and find the comment:

```
<!-- ===== EDIT YOUR ABOUT TEXT BELOW ===== -->
```

Replace the paragraph text with your own content.
