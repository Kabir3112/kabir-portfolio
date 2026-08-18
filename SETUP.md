# Setup

The site is plain HTML, CSS and JavaScript with no build step. Content
lives in Supabase and is edited through `admin.html`.

---

## How it fits together

| File | Does what |
|------|-----------|
| `index.html` | The site. The text in it is a working fallback, not a placeholder. |
| `site-content.js` | Fetches content from Supabase and applies it over that fallback. |
| `admin.html` | The editor. Sign in, change things, save. |
| `config.js` | Supabase URL and anon key. Committed on purpose (see below). |
| `supabase.sql` | Base tables: projects, certificates, newsletter, contact. |
| `admin-schema.sql` | Editable content tables plus the write policies. |

If Supabase is unreachable, `site-content.js` quietly does nothing and
the site renders from `index.html` exactly as authored. Nothing breaks;
it just shows the last committed copy.

---

## First-time setup

### 1. Run the SQL

In Supabase → **SQL Editor**, run these in order:

1. `supabase.sql`
2. `admin-schema.sql`

Both are safe to re-run. `admin-schema.sql` seeds the content tables
from what is currently in `index.html`, so the site looks identical
before and after.

> Before running `admin-schema.sql`, check the email near the top. It
> appears in every write policy and decides who is allowed to edit.

### 2. Create your login

Supabase → **Authentication → Users → Add user**. Create **one** user
with the email from step 1, and confirm it.

### 3. Turn off public signup

Supabase → **Authentication → Providers → Email** → switch off
**Enable signups**.

This matters. Signups are on by default, so without this anyone could
create an account on your project. They still could not edit anything —
the policies check the email — but there is no reason to leave the door
open.

### 4. Open the editor

Locally: start a server in this folder and visit `/admin.html`.

```bash
python -m http.server 3456
```

Live: `https://your-site/admin.html`.

---

## Using the editor

Your site fills most of the window. **Point at anything** and it is
outlined with a label saying what it is; **click** and its options open
in the panel on the right. A walkthrough runs the first time, and the
**?** button in the top bar brings it back.

### The top bar

- **Select / Browse** — clicking normally selects things to edit.
  Switch to Browse to use the site for real: the menu, the buttons, the
  contact form.
- **Desktop / Tablet / Mobile** — check how a change holds up at each
  width.
- **Compact preview** — removes the scroll animation so the whole page
  can be scanned quickly. It only affects the editor, never the live
  site.

### The panel on the right

**Selected** — whatever you last clicked. Text fields, photo placement,
card details, section options. Previous and Next step through the fields
without going back to the preview.

**Sections** — the running order. Drag ⠿ to reorder, click the eye to
hide a section without deleting it, and **+ Add a section** to make a new
one. You choose a shape: text only, text with floating photos, text with
a thumbnail strip, or a full-width quote.

Sections marked **built in** can be hidden and reordered but not
deleted. They hold things a plain section cannot rebuild — a card grid
wired to a table, the newsletter form, the contact form. Hiding one has
the same effect and is reversible.

**Design** — colours, fonts, type sizes, spacing, transparency, and how
far the page scrolls per section. Picking a font that is not already
loaded pulls it from Google Fonts automatically.

**Settings** — page title, search description, share image, CV file,
email and LinkedIn. It also lists gentle checks: a missing CV, photos
with no alt text, sections with no title. None of them block saving.

### Writing body text

The buttons above the text box insert the formatting, so there is no
syntax to remember. Put the cursor on a line and press **Bullet**, or
select a few words and press **Bold**. Underneath, it is stored as:

```
A paragraph. Blank line before the next block.

- a bullet
- another bullet

> a pull quote
```

### Saving

Nothing reaches the site until you press **Save and publish** (or
`Ctrl`/`Cmd` + `S`). The bar along the bottom counts how many unsaved
changes you have, and every field you touch grows a small **↺ undo** to
put just that one back.

Saving reloads the preview but keeps your place and your selection, so
you can carry on where you were.

### The CV button

The Download CV button in the hero stays hidden until **SEO & contact →
CV file URL** has a value. Upload the PDF on the Images tab (or to
Supabase Storage directly) and paste its URL there.

---

## Deploying

The repo is self-contained: `config.js` is committed, so a fresh clone
deploys and works.

**Netlify.** Drag-and-drop still works, but connecting the GitHub repo
instead is worth doing — every push deploys, and there is no file to
remember to include. Netlify → Add new site → Import an existing
project → pick the repo. No build command, publish directory `.`.

Content changes made in the editor do **not** need a deploy. They are
read from Supabase at page load, so saving in the editor updates the
live site immediately. A deploy is only needed when the HTML, CSS or
JavaScript changes.

---

## About `config.js`

It is committed deliberately. It holds the Supabase URL and the **anon**
key, which is published to every visitor's browser by design — that is
how the site reads its own content. Hiding it would protect nothing.

Access is controlled by row level security instead: anyone may read the
content tables, only the signed-in owner may write to them.

The key that must never be committed is **service_role**, which bypasses
every policy. It is not used anywhere in this project.

`.env` stays gitignored.

---

## If something goes wrong

**"Could not load … has admin-schema.sql been run?"** — the content
tables do not exist yet. Run `admin-schema.sql`.

**Save fails with a row level security error** — the signed-in email
does not match the one in the policies. Check the email in
`admin-schema.sql` and re-run it.

**The site shows old content** — published content is cached in the
browser. Saving in the editor clears it; a hard reload also works.

**The site shows the built-in text instead of your edits** — Supabase
was unreachable. Check the browser console; the site falls back to the
copy in `index.html` on purpose.
