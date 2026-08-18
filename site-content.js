/* ============================================================
   KABIR MEHTA — PORTFOLIO  |  site-content.js
   ============================================================
   Pulls editable content out of Supabase and applies it to the
   page. Loaded before app.js so the DOM is already correct by
   the time the scroll architecture measures anything.

   Design rules this file follows:

   1. The markup in index.html is the fallback, not a placeholder.
      If Supabase is unreachable, nothing here runs and the site
      renders exactly as authored. Same principle as
      FALLBACK_PROJECTS in app.js.

   2. Section body copy is stored as a small markdown subset and
      rendered here. It is NOT stored as HTML: the admin is the
      only writer, but rendering arbitrary stored HTML would mean
      a compromised account could inject script into every
      visitor's page. Markdown in, escaped HTML out.

   3. Theme tokens are written as inline custom properties on
      :root, which beats the :root rule in style.css. The literal
      values in that file stay meaningful as defaults.
   ============================================================ */

(function () {
  'use strict';

  /* Bump this whenever the authored order, headings or themes change.
     The cache is applied before the network fetch resolves, so a stale
     copy would re-apply the previous section order on every load — and
     would stick permanently if Supabase is unreachable. A new key makes
     old caches inert; the previous one is dropped so it stops taking up
     quota. */
  const CACHE_KEY = 'siteContentCache.v2';
  try { localStorage.removeItem('siteContentCache.v1'); } catch { /* private mode */ }

  /* Maps a site_theme row key to the CSS custom property it drives.
     Anything not listed here is applied as --<key>, so adding a
     token to the database usually needs no change in this file. */
  const THEME_TOKENS = {
    'color-dark':        '--dark',
    'color-cream':       '--cream',
    'color-green':       '--green',
    'color-green-light': '--green-light',
    'font-serif':        '--font-serif',
    'font-sans':         '--font-sans',
    'panel-pad-x':       '--panel-pad-x',
    'panel-pad-y':       '--panel-pad-y',
    'content-max':       '--content-max',
  };

  /* dwell-vh is read by app.js rather than being a CSS property. */
  const JS_TOKENS = ['dwell-vh'];


  /* ─────────────────────────────────────────────────────────
     THEME
  ───────────────────────────────────────────────────────── */

  function applyTheme(rows) {
    if (!rows || !rows.length) return;
    const root = document.documentElement;

    rows.forEach(({ key, value }) => {
      if (value == null || value === '') return;
      if (JS_TOKENS.includes(key)) {
        window.__siteTokens = window.__siteTokens || {};
        window.__siteTokens[key] = value;
        return;
      }
      if (key === 'font-serif' || key === 'font-sans') ensureFont(value);
      root.style.setProperty(THEME_TOKENS[key] || `--${key}`, value);
    });
  }

  /* index.html only preloads Cormorant Garamond and DM Sans, so
     picking any other family in the admin would silently fall back to
     the next stack entry. Pull the chosen family from Google Fonts
     on demand instead. System stacks are skipped — they need no
     download, and requesting them would 404. */
  const SYSTEM_FAMILIES = [
    'georgia', 'times new roman', 'system-ui', '-apple-system',
    'arial', 'helvetica', 'segoe ui', 'serif', 'sans-serif', 'monospace',
  ];
  const loadedFonts = new Set();

  function ensureFont(stack) {
    const first = String(stack).split(',')[0].trim().replace(/^['"]|['"]$/g, '');
    if (!first) return;

    const lower = first.toLowerCase();
    if (SYSTEM_FAMILIES.includes(lower) || loadedFonts.has(lower)) return;
    loadedFonts.add(lower);

    /* Already in the document's own font link? Nothing to do. */
    const existing = document.head.querySelector('link[href*="fonts.googleapis.com"]');
    if (existing && existing.href.toLowerCase().includes(first.replace(/ /g, '+').toLowerCase())) return;

    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=' +
      encodeURIComponent(first).replace(/%20/g, '+') +
      ':ital,wght@0,300;0,400;0,600;1,400&display=swap';
    document.head.appendChild(link);
  }


  /* ─────────────────────────────────────────────────────────
     MARKDOWN SUBSET

     Deliberately tiny — it covers exactly the three constructs
     the panels use, and nothing else. Blocks are separated by
     blank lines:

       plain text        → <p>
       lines led by "- " → <ul><li>
       lines led by "> " → <blockquote>

     Inline, only **bold** and *italic* are honoured. Everything
     is escaped first, so stored text can never inject markup.
  ───────────────────────────────────────────────────────── */

  function escapeHtml(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function inline(text) {
    return escapeHtml(text)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*]+)\*/g, '<em>$1</em>');
  }

  function renderMarkdown(src) {
    if (!src || !String(src).trim()) return '';

    return String(src)
      .replace(/\r\n/g, '\n')
      .split(/\n{2,}/)
      .map(block => {
        const lines = block.split('\n').map(l => l.trim()).filter(Boolean);
        if (!lines.length) return '';

        if (lines.every(l => l.startsWith('- '))) {
          const items = lines.map(l => `<li>${inline(l.slice(2))}</li>`).join('');
          return `<ul>${items}</ul>`;
        }

        if (lines.every(l => l.startsWith('> '))) {
          return `<blockquote>${inline(lines.map(l => l.slice(2)).join(' '))}</blockquote>`;
        }

        return `<p>${inline(lines.join(' '))}</p>`;
      })
      .filter(Boolean)
      .join('');
  }


  /* ─────────────────────────────────────────────────────────
     SECTIONS
  ───────────────────────────────────────────────────────── */

  /** Write text into the [data-field] element, or remove it if empty. */
  function setField(panel, field, value, asHtml) {
    const el = panel.querySelector(`[data-field="${field}"]`);
    if (!el) return;

    const empty = value == null || String(value).trim() === '';
    if (empty) {
      /* An emptied field should disappear rather than leave a gap —
         several panels legitimately have no role line or tagline. */
      el.hidden = true;
      return;
    }

    el.hidden = false;
    if (asHtml) el.innerHTML = value;
    else el.textContent = value;
  }

  /**
   * Build a panel for a section that has no markup in index.html —
   * i.e. one added in the editor. Everything already in the file keeps
   * its authored markup, because that markup is the offline fallback.
   */
  function buildSection(row) {
    const wrap = document.getElementById('panels-wrap');
    const tplId = row.layout === 'quote' ? 'quoteTemplate' : 'sectionTemplate';
    const tpl = document.getElementById(tplId);
    if (!wrap || !tpl || !tpl.content) return null;

    const block = tpl.content.firstElementChild.cloneNode(true);
    const panel = block.querySelector('.panel');
    panel.id = row.key;

    /* Trim the parts this layout does not use. Leaving an empty
       .panel-media behind would still reserve its column. */
    if (row.layout !== 'photos' && row.layout !== 'gallery') {
      const media = panel.querySelector('.panel-media');
      if (media) media.remove();
    }

    wrap.appendChild(block);
    return panel;
  }

  /** Sections whose markup carries behaviour a template cannot rebuild. */
  const BUILTIN_KEYS = ['hero', 'projects', 'certificates', 'newsletter-section', 'contact'];

  function applySections(rows) {
    if (!rows || !rows.length) return;

    const wrap = document.getElementById('panels-wrap');
    const contact = document.getElementById('contact');

    /* A panel present in the markup but absent from the database was
       deleted in the editor. Built-in panels are exempt: they are never
       deletable, and dropping one because a row is missing would take
       the contact form off the page. */
    const known = rows.map(r => r.key);
    document.querySelectorAll('.panel[id]').forEach(panel => {
      if (known.includes(panel.id) || BUILTIN_KEYS.includes(panel.id)) return;
      const node = panel.closest('.story-block') || panel;
      node.remove();
      document.querySelectorAll(`[data-target="${panel.id}"]`).forEach(btn => {
        const li = btn.closest('li');
        (li || btn).remove();
      });
    });

    rows.slice()
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
      .forEach((row, index) => {
        let panel = document.getElementById(row.key);
        if (!panel) {
          panel = buildSection(row);
          if (!panel) return;
          addNavEntry(row);
        }

        /* A .story-block wrapper is what actually sits in the flow. */
        const node = panel.closest('.story-block') || panel;

        if (!row.visible) {
          node.hidden = true;
          document
            .querySelectorAll(`[data-target="${row.key}"]`)
            .forEach(btn => { btn.closest('li') ? btn.closest('li').hidden = true : btn.hidden = true; });
          return;
        }
        node.hidden = false;

        setField(panel, 'meta',    row.meta);
        setField(panel, 'title',   row.title);
        setField(panel, 'role',    row.role);
        setField(panel, 'tagline', row.tagline);

        /* Most panels hold their body in a <div>, which takes rendered
           markdown. The newsletter's is a single <p>, and putting
           <p> inside <p> is invalid and collapses the layout — so a
           block-level target gets markdown, an inline one gets text. */
        const bodyEl = panel.querySelector('[data-field="body"]');
        if (bodyEl) {
          const inlineTarget = /^(P|SPAN|H\d|LI)$/.test(bodyEl.tagName);
          setField(panel, 'body',
            inlineTarget ? row.body : renderMarkdown(row.body),
            !inlineTarget);
        }

        if (row.theme) panel.setAttribute('data-theme', row.theme);

        /* Nav labels, both menus. */
        document
          .querySelectorAll(`[data-target="${row.key}"]`)
          .forEach(btn => {
            if (row.nav_label) btn.textContent = row.nav_label;
            const li = btn.closest('li');
            if (li) li.hidden = false;
          });

        /* Reordering: move the block into its ranked position.
           Contact is not inside a .story-block and stays last. */
        if (wrap && node.parentNode === wrap && node !== contact) {
          wrap.insertBefore(node, contact || null);
        }

        /* Stacking order drives which panel covers which as they
           scroll past each other. */
        panel.style.zIndex = String(index + 2);
      });
  }


  /* ─────────────────────────────────────────────────────────
     SETTINGS — hero copy, SEO, CV
  ───────────────────────────────────────────────────────── */

  function applySettings(rows) {
    if (!rows || !rows.length) return;

    const map = {};
    rows.forEach(({ key, value }) => { map[key] = value; });

    const text = (sel, val) => {
      if (val == null) return;
      const el = document.querySelector(sel);
      if (el) el.textContent = val;
    };
    const html = (sel, val) => {
      if (val == null) return;
      const el = document.querySelector(sel);
      /* Hero proof points are the one place stored markup is allowed,
         because they are written as "<strong>2 years</strong> …".
         Rendered through the same markdown inliner, not raw. */
      if (el) el.innerHTML = inline(String(val).replace(/<\/?strong>/g, '**'));
    };

    text('[data-setting="hero.greeting"]', map['hero.greeting']);
    text('[data-setting="hero.name"]',     map['hero.name']);
    text('[data-setting="hero.role"]',     map['hero.role']);
    text('[data-setting="hero.pitch"]',    map['hero.pitch']);
    html('[data-setting="hero.proof1"]',   map['hero.proof1']);
    html('[data-setting="hero.proof2"]',   map['hero.proof2']);
    html('[data-setting="hero.proof3"]',   map['hero.proof3']);
    text('[data-setting="hero.quip1"]',    map['hero.quip1']);
    text('[data-setting="hero.quip2"]',    map['hero.quip2']);
    text('[data-setting="hero.cta_primary"]', map['hero.cta_primary']);
    text('[data-setting="hero.cta_contact"]', map['hero.cta_contact']);
    text('[data-setting="hero.cta_story"]',   map['hero.cta_story']);
    text('[data-setting="contact.bubble"]',   map['contact.bubble']);

    if (map['hero.avatar_url']) {
      document.querySelectorAll('.avatar-face').forEach(img => {
        img.src = map['hero.avatar_url'];
      });
    }

    /* Email and LinkedIn appear in several places, as both label
       and href. */
    if (map['contact.email']) {
      document.querySelectorAll('[data-setting="contact.email"]').forEach(a => {
        a.href = `mailto:${map['contact.email']}`;
        const label = a.querySelector('[data-label]') || a;
        if (label === a) a.textContent = map['contact.email'];
        else label.textContent = map['contact.email'];
      });
    }
    if (map['contact.linkedin']) {
      document.querySelectorAll('[data-setting="contact.linkedin"]').forEach(a => {
        a.href = map['contact.linkedin'];
      });
    }

    /* CV button: shown only when a URL exists. data-managed tells
       app.js's initCvLink to keep its hands off — otherwise it runs
       afterwards and resets the button to its offline default. */
    const cv = document.getElementById('heroCvBtn');
    if (cv) {
      cv.dataset.managed = 'true';
      if (map['cv.url']) {
        cv.href = map['cv.url'];
        cv.setAttribute('download', '');
        cv.textContent = map['cv.label'] || 'Download Resume';
        cv.hidden = false;
      } else if (!cv.getAttribute('href')) {
        /* Only hide when there is genuinely nothing to download. The
           resume ships in the repo and is linked in the markup, so an
           empty cv.url in the database means "not overridden here" —
           not "remove the button". Hiding on empty used to take a
           working download off the page. */
        cv.hidden = true;
      } else {
        cv.hidden = false;
      }
    }

    /* SEO */
    if (map['seo.title']) {
      document.title = map['seo.title'];
      setMeta('property', 'og:title', map['seo.title']);
      setMeta('name', 'twitter:title', map['seo.title']);
    }
    if (map['seo.description']) {
      setMeta('name', 'description', map['seo.description']);
      setMeta('property', 'og:description', map['seo.description']);
      setMeta('name', 'twitter:description', map['seo.description']);
    }
    if (map['seo.og_image']) {
      setMeta('property', 'og:image', map['seo.og_image']);
      setMeta('name', 'twitter:image', map['seo.og_image']);
    }
  }

  function setMeta(attr, name, content) {
    let tag = document.head.querySelector(`meta[${attr}="${name}"]`);
    if (!tag) {
      tag = document.createElement('meta');
      tag.setAttribute(attr, name);
      document.head.appendChild(tag);
    }
    tag.setAttribute('content', content);
  }


  /* ─────────────────────────────────────────────────────────
     MEDIA — collage placement and gallery strips
  ───────────────────────────────────────────────────────── */

  function applyMedia(rows) {
    if (!rows || !rows.length) return;

    const bySection = {};
    rows.slice()
      .sort((a, b) => (a.sort_order || 0) - (b.sort_order || 0))
      .forEach(row => {
        (bySection[row.section_key] = bySection[row.section_key] || []).push(row);
      });

    Object.keys(bySection).forEach(key => {
      const panel = document.getElementById(key);
      if (!panel) return;

      const collage = bySection[key].filter(r => r.placement === 'collage');
      const gallery = bySection[key].filter(r => r.placement === 'gallery');

      if (collage.length) {
        let box = panel.querySelector('.panel-media');
        if (!box) {
          box = document.createElement('div');
          box.className = 'panel-media';
          panel.insertBefore(box, panel.firstChild);
        }
        box.innerHTML = collage.map(r => `
          <figure class="media-card${r.is_logo ? ' media-card--logo' : ''}"
                  data-media-id="${escapeHtml(r.id || '')}"
                  style="--x:${num(r.x)}%; --y:${num(r.y)}%; --w:${num(r.w)}%; --tilt:${num(r.tilt)}deg; --ar:${escapeHtml(r.aspect || '4/3')}; --d:${num(r.delay)}">
            <img src="${escapeHtml(r.image_url)}" alt="${escapeHtml(r.alt || '')}" loading="lazy" />
          </figure>`).join('');
      }

      if (gallery.length) {
        let strip = panel.querySelector('.mini-gallery');
        if (!strip) {
          const body = panel.querySelector('[data-field="body"]');
          if (!body) return;
          strip = document.createElement('div');
          strip.className = 'mini-gallery';
          body.appendChild(strip);
        }
        strip.innerHTML = gallery.map(r => `
          <figure data-media-id="${escapeHtml(r.id || '')}">
            <img src="${escapeHtml(r.image_url)}" alt="${escapeHtml(r.alt || '')}" loading="lazy" />
            ${r.caption ? `<figcaption>${escapeHtml(r.caption)}</figcaption>` : ''}
          </figure>`).join('');
      }
    });
  }

  function num(v) {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : 0;
  }

  /**
   * Give a newly built section an entry in both navs, cloning an
   * existing button so it inherits every class and handler binding
   * the nav code expects.
   */
  function addNavEntry(row) {
    [['#side-nav ul', '.nav-item'], ['#mob-nav .mob-nav-list', '.mob-nav-item']]
      .forEach(([listSel, itemSel]) => {
        const list = document.querySelector(listSel);
        const sample = list && list.querySelector(itemSel);
        if (!list || !sample) return;

        const li = document.createElement('li');
        const btn = sample.cloneNode(false);
        btn.classList.remove('active');
        btn.dataset.target = row.key;
        btn.textContent = row.nav_label || row.title || row.key;
        li.appendChild(btn);
        list.appendChild(li);

        /* app.js binds nav clicks once at boot, so a button added
           afterwards needs its own handler. */
        btn.addEventListener('click', () => {
          if (typeof window.scrollToSection === 'function') {
            window.scrollToSection(row.key);
          } else {
            const el = document.getElementById(row.key);
            const block = el && (el.closest('.story-block') || el);
            if (block) {
              window.scrollTo({
                top: block.getBoundingClientRect().top + window.scrollY,
                behavior: 'smooth',
              });
            }
          }
        });
      });
  }


  /* ─────────────────────────────────────────────────────────
     LOAD

     Cached content is applied synchronously so a returning
     visitor never sees the authored defaults flash before their
     customised version arrives. The network copy then overwrites
     it and refreshes the cache.
  ───────────────────────────────────────────────────────── */

  function applyAll(data) {
    if (!data) return;
    try {
      applyTheme(data.theme);
      applySections(data.sections);
      applySettings(data.settings);
      applyMedia(data.media);
    } catch (err) {
      console.warn('Site content: could not apply.', err);
    }
  }

  function readCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  function writeCache(data) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch { /* quota, private mode */ }
  }

  async function fetchAll() {
    /* Nothing here is worth 207 KB of supabase-js when a previous visit
       already established the tables are not there. loadSupabase()
       pulls the library only at this point, not on every page view. */
    if (!window.supabaseWorthTrying || !window.supabaseWorthTrying('siteContent')) return null;

    const db = window.loadSupabase ? await window.loadSupabase() : null;
    if (!db) return null;

    const [sections, settings, theme, media] = await Promise.all([
      db.from('site_sections').select('*'),
      db.from('site_settings').select('*'),
      db.from('site_theme').select('*'),
      db.from('site_media').select('*'),
    ]);

    /* A missing table means the schema has not been run yet. That is
       not an error worth breaking the page over — the authored HTML
       is already correct. */
    if (sections.error || settings.error || theme.error || media.error) {
      console.warn('Site content: schema not available, using authored content.',
        sections.error || settings.error || theme.error || media.error);
      /* Remember, so the next visit skips the download entirely. Expires
         on its own, so running admin-schema.sql later still takes hold. */
      window.supabaseSchemaMissing && window.supabaseSchemaMissing('siteContent');
      return null;
    }

    return {
      sections: sections.data,
      settings: settings.data,
      theme: theme.data,
      media: media.data,
    };
  }

  async function init() {
    /* The cache paints instantly and costs no network. */
    applyAll(readCache());
    window.dispatchEvent(new Event('site-content-ready'));

    /* The network refresh is a background job: it must never sit in
       front of first paint, and on a site whose copy lives in
       index.html it usually changes nothing. */
    const refresh = async () => {
      try {
        const fresh = await fetchAll();
        if (fresh) {
          applyAll(fresh);
          writeCache(fresh);
          window.dispatchEvent(new Event('site-content-ready'));
        }
      } catch (err) {
        console.warn('Site content: fetch failed, using authored content.', err);
      }
    };
    if (window.whenIdle) window.whenIdle(refresh); else refresh();
  }

  window.__siteContentReady = (document.readyState === 'loading')
    ? new Promise(resolve => document.addEventListener('DOMContentLoaded', () => init().then(resolve)))
    : init();
})();
