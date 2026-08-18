/* ============================================================
   KABIR MEHTA — PORTFOLIO  |  admin.js
   ============================================================
   The site editor. The preview is the main surface: you click
   something on the page and the inspector on the right shows the
   options for it.

   Security note: nothing in this file enforces permission. The
   anon key it uses is public — it is in every visitor's browser
   already. What stops a stranger writing to these tables is the
   RLS policy in admin-schema.sql, which checks the signed-in
   user's email. This file only has to obtain a session and send
   requests; Postgres decides whether they are allowed.

   Contents
     1. Client and state
     2. Field definitions
     3. Auth
     4. Load
     5. Field builders (with per-field revert)
     6. Preview: injection, select/browse, click resolution
     7. Inspector
     8. Outline: order, visibility, add, delete
     9. Design and settings
    10. Save
    11. Walkthrough
    12. Chrome
   ============================================================ */

(function () {
  'use strict';

  /* ─────────────────────────────────────────────────────────
     1. CLIENT AND STATE
  ───────────────────────────────────────────────────────── */

  if (!window.supabase || !window.SUPABASE_URL || !window.SUPABASE_ANON_KEY) {
    document.body.innerHTML =
      '<div style="padding:2rem;font:14px system-ui;color:#e8eae6;background:#0f1210;height:100vh">' +
      '<h1 style="font-size:1rem">Configuration missing</h1>' +
      '<p style="color:#8b968d;margin-top:.5rem">config.js did not load, or the Supabase library is ' +
      'unavailable. Check that config.js sits next to admin.html and that you are online.</p></div>';
    return;
  }

  const db = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);

  /* Working copy, plus an untouched snapshot taken at load. The
     snapshot is what "3 unsaved changes" and the per-field revert
     buttons compare against. */
  const state = { sections: [], settings: {}, theme: {}, media: [], projects: [], certs: [] };
  let orig = null;
  const removed = { sections: [], media: [], projects: [], certs: [] };

  /* What is currently selected in the preview. */
  let selection = null;
  let mode = 'select';           // select | browse
  let pendingRestore = null;     // scroll + selection to reapply after a save

  const $  = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const SECTION_COLS = ['nav_label', 'meta', 'title', 'role', 'tagline', 'body',
                        'theme', 'sort_order', 'visible', 'layout'];
  const MEDIA_COLS   = ['placement', 'image_url', 'alt', 'caption', 'x', 'y', 'w',
                        'tilt', 'aspect', 'delay', 'is_logo', 'sort_order'];


  /* ─────────────────────────────────────────────────────────
     2. FIELD DEFINITIONS
  ───────────────────────────────────────────────────────── */

  /* Plain-English labels. The database column names are not shown
     anywhere: "meta" means nothing to someone editing their bio. */
  const SECTION_FIELDS = [
    { k: 'meta',    label: 'Dateline',  hint: 'The small line above the title, e.g. "London, UK · Sep 2025 to Sep 2026"' },
    { k: 'title',   label: 'Title',     hint: 'The big heading' },
    { k: 'role',    label: 'Role line', hint: 'Job title or qualification. Leave empty to hide it.' },
    { k: 'tagline', label: 'Tagline',   hint: 'The italic line under the title' },
    { k: 'body',    label: 'Body text', type: 'markdown' },
  ];

  const HERO_FIELDS = [
    { key: 'hero.greeting',    label: 'Greeting' },
    { key: 'hero.name',        label: 'Your name' },
    { key: 'hero.role',        label: 'Role line', hint: 'Course and university, or job title' },
    { key: 'hero.pitch',       label: 'Opening paragraph', type: 'textarea',
      hint: 'Two or three sentences. This is what a recruiter reads first.' },
    { key: 'hero.proof1',      label: 'Proof point 1', hint: 'Wrap the standout part in **double asterisks** to bold it' },
    { key: 'hero.proof2',      label: 'Proof point 2' },
    { key: 'hero.proof3',      label: 'Proof point 3' },
    { key: 'hero.quip1',       label: 'Avatar joke, line 1' },
    { key: 'hero.quip2',       label: 'Avatar joke, line 2' },
    { key: 'hero.cta_primary', label: 'Main button' },
    { key: 'hero.cta_contact', label: 'Contact button' },
    { key: 'hero.cta_story',   label: 'Story button' },
    { key: 'hero.avatar_url',  label: 'Avatar image URL' },
  ];

  const SEO_FIELDS = [
    { key: 'seo.title',        label: 'Page title', hint: 'Shown in the browser tab and in search results' },
    { key: 'seo.description',  label: 'Search description', type: 'textarea',
      hint: 'The grey text under your link in Google. Around 150 characters.' },
    { key: 'seo.og_image',     label: 'Share image URL', hint: 'The picture shown when your link is posted' },
    { key: 'cv.url',           label: 'CV file URL', hint: 'Leave empty and the Download CV button stays hidden' },
    { key: 'cv.label',         label: 'CV button label' },
    { key: 'contact.email',    label: 'Email address' },
    { key: 'contact.linkedin', label: 'LinkedIn URL' },
    { key: 'contact.bubble',   label: 'Speech bubble text' },
  ];

  const PROJECT_FIELDS = [
    { k: 'title',           label: 'Title' },
    { k: 'description',     label: 'Description', type: 'textarea' },
    { k: 'project_url',     label: 'Live site URL', hint: 'Adds a "Visit Website" button' },
    { k: 'prototype_url',   label: 'Prototype URL', hint: 'Adds a "View Prototype" button' },
    { k: 'certificate_url', label: 'Certificate PDF URL' },
  ];

  const CERT_FIELDS = [
    { k: 'title',   label: 'Title' },
    { k: 'issuer',  label: 'Issued by' },
    { k: 'pdf_url', label: 'PDF URL' },
    { k: 'link',    label: 'Verification link', hint: 'Used only when there is no PDF' },
  ];

  const FONT_CHOICES = [
    ["'Cormorant Garamond', Georgia, serif", 'Cormorant Garamond (current display)'],
    ["'DM Sans', system-ui, sans-serif",     'DM Sans (current body)'],
    ["'Playfair Display', Georgia, serif",   'Playfair Display'],
    ["'Lora', Georgia, serif",               'Lora'],
    ["'Libre Baskerville', Georgia, serif",  'Libre Baskerville'],
    ["'Inter', system-ui, sans-serif",       'Inter'],
    ["'Work Sans', system-ui, sans-serif",   'Work Sans'],
    ["'Space Grotesk', system-ui, sans-serif", 'Space Grotesk'],
    ["Georgia, 'Times New Roman', serif",    'Georgia (system, no download)'],
    ["system-ui, -apple-system, sans-serif", 'System sans (no download)'],
  ];

  const THEME_FIELDS = [
    { key: 'color-dark',        label: 'Dark background',   type: 'color' },
    { key: 'color-cream',       label: 'Light background',  type: 'color' },
    { key: 'color-green',       label: 'Green background',  type: 'color' },
    { key: 'color-green-light', label: 'Accent',            type: 'color',
      hint: 'Buttons, the underline, the active nav item' },
    { key: 'font-serif',        label: 'Display font',      type: 'font' },
    { key: 'font-sans',         label: 'Body font',         type: 'font' },
    { key: 'hero-name-scale',   label: 'Your name size',     type: 'range', min: 0.6, max: 1.8, step: 0.05, suffix: '×' },
    { key: 'title-scale',       label: 'Section title size', type: 'range', min: 0.6, max: 1.8, step: 0.05, suffix: '×' },
    { key: 'body-scale',        label: 'Body text size',     type: 'range', min: 0.8, max: 1.6, step: 0.05, suffix: '×' },
    { key: 'panel-pad-x',       label: 'Side padding',      type: 'text', hint: 'A CSS length, e.g. 8vw or 90px' },
    { key: 'panel-pad-y',       label: 'Top and bottom padding', type: 'text' },
    { key: 'content-max',       label: 'Text column width', type: 'text', hint: 'e.g. 640px' },
    { key: 'nav-alpha',         label: 'Nav transparency',   type: 'range', min: 0, max: 1, step: 0.02 },
    { key: 'card-alpha',        label: 'Card fill',          type: 'range', min: 0, max: 0.3, step: 0.01 },
    { key: 'media-shadow',      label: 'Photo shadow',       type: 'range', min: 0, max: 0.6, step: 0.02 },
    { key: 'dwell-vh',          label: 'Scroll held per section', type: 'range', min: 0, max: 100, step: 5, suffix: 'vh',
      hint: 'How far you scroll while a section is pinned. 0 removes the effect entirely.' },
  ];

  /* Friendly names for the hover label in the preview. */
  const FIELD_LABELS = {
    meta: 'Dateline', title: 'Title', role: 'Role line',
    tagline: 'Tagline', body: 'Body text',
  };


  /* ─────────────────────────────────────────────────────────
     3. AUTH
  ───────────────────────────────────────────────────────── */

  async function initAuth() {
    const { data } = await db.auth.getSession();
    if (data.session) return showApp(data.session);

    $('#loginScreen').hidden = false;
    $('#loginForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = $('#loginError');
      err.textContent = '';

      const { data: res, error } = await db.auth.signInWithPassword({
        email: $('#loginEmail').value.trim(),
        password: $('#loginPassword').value,
      });
      if (error) { err.textContent = error.message; return; }
      showApp(res.session);
    });
  }

  async function showApp(session) {
    $('#loginScreen').hidden = true;
    $('#app').hidden = false;
    $('#whoami').textContent = session.user.email;

    await loadAll();
    renderOutline();
    renderTheme();
    renderSettingFields('#seoFields', SEO_FIELDS);
    renderWarnings();
    wireChrome();
    initPreview();
    maybeStartTour();
  }


  /* ─────────────────────────────────────────────────────────
     4. LOAD
  ───────────────────────────────────────────────────────── */

  async function loadAll() {
    const [sections, settings, theme, media, projects, certs] = await Promise.all([
      db.from('site_sections').select('*').order('sort_order'),
      db.from('site_settings').select('*'),
      db.from('site_theme').select('*'),
      db.from('site_media').select('*').order('sort_order'),
      db.from('projects').select('*').order('sort_order'),
      db.from('certificates').select('*').order('sort_order'),
    ]);

    const bad = [sections, settings, theme, media, projects, certs].find(r => r.error);
    if (bad) {
      setSaveState('Could not load: ' + bad.error.message + ' — has admin-schema.sql been run?', 'error');
      return;
    }

    state.sections = sections.data || [];
    state.media    = media.data || [];
    state.projects = projects.data || [];
    state.certs    = certs.data || [];

    state.settings = {};
    (settings.data || []).forEach(r => { state.settings[r.key] = r.value; });
    state.theme = {};
    (theme.data || []).forEach(r => { state.theme[r.key] = r.value; });

    orig = JSON.parse(JSON.stringify(state));
  }

  const sectionOf  = key => state.sections.find(s => s.key === key);
  const origSection = key => orig && orig.sections.find(s => s.key === key);
  const mediaOf    = id  => state.media.find(m => String(m.id) === String(id));
  const origMedia  = id  => orig && orig.media.find(m => String(m.id) === String(id));
  const rowOf      = (table, id) =>
    (table === 'projects' ? state.projects : state.certs).find(r => String(r.id) === String(id));
  const origRow    = (table, id) =>
    orig && (table === 'projects' ? orig.projects : orig.certs).find(r => String(r.id) === String(id));


  /* ─────────────────────────────────────────────────────────
     5. FIELD BUILDERS

     Every field can show a revert button when its value differs
     from the snapshot. They are refreshed together rather than
     re-rendered, so typing never loses focus.
  ───────────────────────────────────────────────────────── */

  const revertSyncers = [];

  function refreshReverts() {
    revertSyncers.forEach(fn => { try { fn(); } catch { /* detached */ } });
    updateUnsaved();
  }

  function fieldWrap(label, control, hint, revert) {
    const wrap = document.createElement('div');
    wrap.className = 'field';

    const head = document.createElement('div');
    head.className = 'field__label';
    const span = document.createElement('span');
    span.textContent = label;
    head.appendChild(span);

    if (revert) {
      const btn = document.createElement('button');
      btn.className = 'revert-btn';
      btn.type = 'button';
      btn.textContent = '↺ undo';
      btn.hidden = true;
      btn.addEventListener('click', () => { revert.apply(); refreshReverts(); });
      head.appendChild(btn);
      revertSyncers.push(() => { btn.hidden = !revert.isChanged(); });
    }

    wrap.appendChild(head);
    wrap.appendChild(control);

    if (hint) {
      const h = document.createElement('div');
      h.className = 'field__hint';
      h.textContent = hint;
      wrap.appendChild(h);
    }
    return wrap;
  }

  function textInput(value, onInput, isArea) {
    const el = document.createElement(isArea ? 'textarea' : 'input');
    if (!isArea) el.type = 'text';
    el.value = value == null ? '' : value;
    el.addEventListener('input', () => { onInput(el.value); refreshReverts(); });
    return el;
  }

  /**
   * Body editor: a plain textarea with a toolbar that inserts the
   * markup, so bullets and quotes never have to be remembered.
   */
  function markdownInput(value, onInput) {
    const holder = document.createElement('div');

    const bar = document.createElement('div');
    bar.className = 'md-bar';

    const area = document.createElement('textarea');
    area.value = value == null ? '' : value;
    area.addEventListener('input', () => { onInput(area.value); refreshReverts(); });

    const tools = [
      ['Bullet', 'line', '- '],
      ['Quote',  'line', '> '],
      ['Bold',   'wrap', '**'],
      ['Italic', 'wrap', '*'],
      ['Paragraph', 'break', ''],
    ];

    tools.forEach(([label, kind, token]) => {
      const b = document.createElement('button');
      b.className = 'md-btn';
      b.type = 'button';
      b.textContent = label;
      b.addEventListener('click', () => {
        applyMarkdownTool(area, kind, token);
        onInput(area.value);
        refreshReverts();
      });
      bar.appendChild(b);
    });

    holder.appendChild(bar);
    holder.appendChild(area);
    holder.__input = area;
    return holder;
  }

  function applyMarkdownTool(area, kind, token) {
    const start = area.selectionStart;
    const end   = area.selectionEnd;
    const text  = area.value;

    if (kind === 'wrap') {
      const chosen = text.slice(start, end) || 'text';
      area.value = text.slice(0, start) + token + chosen + token + text.slice(end);
      area.selectionStart = start + token.length;
      area.selectionEnd   = start + token.length + chosen.length;

    } else if (kind === 'break') {
      area.value = text.slice(0, start) + '\n\n' + text.slice(end);
      area.selectionStart = area.selectionEnd = start + 2;

    } else {
      /* Prefix every line the selection touches, so highlighting three
         lines and pressing Bullet turns all three into bullets. */
      const from = text.lastIndexOf('\n', start - 1) + 1;
      const toRaw = text.indexOf('\n', end);
      const to = toRaw === -1 ? text.length : toRaw;
      const block = text.slice(from, to)
        .split('\n')
        .map(l => (l.startsWith(token) ? l : token + l))
        .join('\n');
      area.value = text.slice(0, from) + block + text.slice(to);
      area.selectionStart = area.selectionEnd = from + block.length;
    }
    area.focus();
  }

  function selectInput(value, options, onChange) {
    const el = document.createElement('select');
    options.forEach(([val, label]) => {
      const o = document.createElement('option');
      o.value = val; o.textContent = label;
      el.appendChild(o);
    });
    el.value = value;
    /* A stored value outside the list would silently snap to the first
       option, so keep it as an extra entry. */
    if (el.value !== value && value) {
      const o = document.createElement('option');
      o.value = value; o.textContent = value + ' (current)';
      el.appendChild(o); el.value = value;
    }
    el.addEventListener('change', () => { onChange(el.value); refreshReverts(); });
    return el;
  }

  function colorInput(value, onChange) {
    const wrap = document.createElement('div');
    wrap.className = 'color-field';
    const swatch = document.createElement('input');
    swatch.type = 'color';
    swatch.value = /^#[0-9a-f]{6}$/i.test(value || '') ? value : '#000000';
    const text = document.createElement('input');
    text.type = 'text';
    text.value = value || '';

    swatch.addEventListener('input', () => {
      text.value = swatch.value; onChange(swatch.value); refreshReverts();
    });
    text.addEventListener('input', () => {
      if (/^#[0-9a-f]{6}$/i.test(text.value)) swatch.value = text.value;
      onChange(text.value); refreshReverts();
    });

    wrap.appendChild(swatch);
    wrap.appendChild(text);
    return wrap;
  }

  function rangeInput(value, def, onChange) {
    const wrap = document.createElement('div');
    wrap.className = 'range-field';
    const r = document.createElement('input');
    r.type = 'range';
    r.min = def.min; r.max = def.max; r.step = def.step;
    r.value = parseFloat(value);
    if (!Number.isFinite(parseFloat(r.value))) r.value = def.min;

    const out = document.createElement('output');
    out.textContent = r.value + (def.suffix || '');

    r.addEventListener('input', () => {
      out.textContent = r.value + (def.suffix || '');
      onChange(r.value); refreshReverts();
    });

    wrap.appendChild(r);
    wrap.appendChild(out);
    return wrap;
  }

  function checkboxInput(checked, label, onChange) {
    const l = document.createElement('label');
    l.className = 'checkbox';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !!checked;
    cb.addEventListener('change', () => { onChange(cb.checked); refreshReverts(); });
    l.appendChild(cb);
    l.appendChild(document.createTextNode(label));
    return l;
  }


  /* ─────────────────────────────────────────────────────────
     6. PREVIEW

     The iframe is same-origin, so selection behaviour is injected
     straight into its document rather than posted across.
  ───────────────────────────────────────────────────────── */

  const previewDoc = () => {
    try { return $('#previewFrame').contentDocument; } catch { return null; }
  };
  const previewWin = () => {
    try { return $('#previewFrame').contentWindow; } catch { return null; }
  };

  function initPreview() {
    const frame = $('#previewFrame');
    frame.addEventListener('load', onPreviewLoad);
    if (previewDoc() && previewDoc().readyState === 'complete') onPreviewLoad();
  }

  function onPreviewLoad() {
    const doc = previewDoc();
    if (!doc || !doc.body) return;

    injectPreviewCss(doc);
    attachPreviewHandlers(doc);
    applyFlatten(doc, $('#flattenToggle').checked);
    restoreAfterSave();
  }

  function injectPreviewCss(doc) {
    if (doc.getElementById('__editorCss')) return;
    const style = doc.createElement('style');
    style.id = '__editorCss';
    style.textContent = `
      .__ed-hover { outline: 2px dashed #7a9a6a !important; outline-offset: 3px; cursor: pointer !important; }
      .__ed-selected { outline: 2px solid #7a9a6a !important; outline-offset: 3px;
                       box-shadow: 0 0 0 6px rgba(122,154,106,0.18) !important; }
      #__edLabel {
        position: fixed; z-index: 2147483647; pointer-events: none;
        background: #7a9a6a; color: #10140f;
        font: 500 11px/1 ui-sans-serif, system-ui, sans-serif;
        letter-spacing: .02em; padding: 4px 7px; border-radius: 4px;
        white-space: nowrap; transform: translateY(-100%);
      }
      /* Compact mode: unpin the panels so the whole page can be
         scanned quickly while editing. Mirrors the mobile rules. */
      body.__ed-flat .story-block { height: auto !important; }
      body.__ed-flat .panel {
        position: relative !important; height: auto !important;
        min-height: 42vh !important; transform: none !important;
        opacity: 1 !important; overflow: visible !important;
        padding-top: 5vh !important; padding-bottom: 5vh !important;
      }
      body.__ed-flat .panel-inner {
        opacity: 1 !important; transform: none !important; filter: none !important;
      }
      body.__ed-flat .text-reveal-inner,
      body.__ed-flat .tl-card,
      body.__ed-flat .media-card { opacity: 1 !important; transform: none !important; }
      body.__ed-flat #side-nav { display: none !important; }
    `;
    doc.head.appendChild(style);

    const label = doc.createElement('div');
    label.id = '__edLabel';
    label.hidden = true;
    doc.body.appendChild(label);
  }

  function applyFlatten(doc, on) {
    if (!doc || !doc.body) return;
    doc.body.classList.toggle('__ed-flat', !!on);
  }

  /**
   * Map a clicked element to something editable.
   * Order matters: the most specific wins, so clicking a photo gives
   * the photo rather than the section it sits in.
   */
  function resolveTarget(el) {
    if (!el || !el.closest) return null;

    const media = el.closest('[data-media-id]');
    if (media && media.dataset.mediaId) return { type: 'media', id: media.dataset.mediaId };

    const row = el.closest('[data-row-id]');
    if (row && row.dataset.rowId) {
      return { type: 'row', table: row.dataset.rowTable, id: row.dataset.rowId };
    }

    const setting = el.closest('[data-setting]');
    if (setting) return { type: 'setting', key: setting.dataset.setting };

    const field = el.closest('[data-field]');
    if (field) {
      const panel = field.closest('.panel');
      if (panel && panel.id) return { type: 'field', key: panel.id, field: field.dataset.field };
    }

    const panel = el.closest('.panel');
    if (panel && panel.id) return { type: 'section', key: panel.id };

    return null;
  }

  /** What the hover chip says. */
  function targetLabel(t) {
    if (!t) return '';
    if (t.type === 'media')   return 'Photo';
    if (t.type === 'row')     return t.table === 'projects' ? 'Project card' : 'Certificate card';
    if (t.type === 'setting') return 'Hero · ' + prettySetting(t.key);
    if (t.type === 'field') {
      const s = sectionOf(t.key);
      return (FIELD_LABELS[t.field] || t.field) + ' · ' + ((s && s.title) || t.key);
    }
    if (t.type === 'section') {
      const s = sectionOf(t.key);
      return 'Section · ' + ((s && s.title) || t.key);
    }
    return '';
  }

  function prettySetting(key) {
    const found = HERO_FIELDS.concat(SEO_FIELDS).find(f => f.key === key);
    return found ? found.label : key;
  }

  function attachPreviewHandlers(doc) {
    if (doc.__edWired) return;
    doc.__edWired = true;

    const label = () => doc.getElementById('__edLabel');
    let hovered = null;

    doc.addEventListener('mousemove', (e) => {
      if (mode !== 'select') return;
      const t = resolveTarget(e.target);
      const el = t ? nodeFor(doc, t) : null;

      if (el !== hovered) {
        if (hovered) hovered.classList.remove('__ed-hover');
        hovered = el;
        if (hovered) hovered.classList.add('__ed-hover');
      }

      const chip = label();
      if (!chip) return;
      if (!t) { chip.hidden = true; return; }
      chip.hidden = false;
      chip.textContent = targetLabel(t);
      chip.style.left = Math.max(4, e.clientX - 6) + 'px';
      chip.style.top  = Math.max(16, e.clientY - 8) + 'px';
    }, true);

    doc.addEventListener('mouseleave', () => {
      if (hovered) { hovered.classList.remove('__ed-hover'); hovered = null; }
      const chip = label();
      if (chip) chip.hidden = true;
    }, true);

    /* Capture phase and preventDefault, so a click on a link or a
       submit button selects it instead of navigating away. */
    doc.addEventListener('click', (e) => {
      if (mode !== 'select') return;
      const t = resolveTarget(e.target);
      if (!t) return;
      e.preventDefault();
      e.stopPropagation();
      select(t);
    }, true);

    doc.addEventListener('submit', (e) => {
      if (mode === 'select') e.preventDefault();
    }, true);

    doc.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') deselect();
    });
  }

  /** Find the element in the preview that a target refers to. */
  function nodeFor(doc, t) {
    if (!doc || !t) return null;
    if (t.type === 'media')   return doc.querySelector(`[data-media-id="${cssEscape(t.id)}"]`);
    if (t.type === 'row')     return doc.querySelector(`[data-row-id="${cssEscape(t.id)}"]`);
    if (t.type === 'setting') return doc.querySelector(`[data-setting="${cssEscape(t.key)}"]`);
    if (t.type === 'field') {
      const panel = doc.getElementById(t.key);
      return panel && panel.querySelector(`[data-field="${cssEscape(t.field)}"]`);
    }
    if (t.type === 'section') return doc.getElementById(t.key);
    return null;
  }

  function cssEscape(v) {
    return String(v).replace(/["\\]/g, '\\$&');
  }

  function highlightSelected() {
    const doc = previewDoc();
    if (!doc) return;
    $$('.__ed-selected', doc).forEach(el => el.classList.remove('__ed-selected'));
    const el = nodeFor(doc, selection);
    if (el) {
      el.classList.add('__ed-selected');
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }

  function select(t) {
    selection = t;
    showTab('selected');
    renderSelected();
    highlightSelected();
    markOutlineSelection();
  }

  function deselect() {
    selection = null;
    const doc = previewDoc();
    if (doc) $$('.__ed-selected', doc).forEach(el => el.classList.remove('__ed-selected'));
    renderSelected();
    markOutlineSelection();
  }


  /* ─────────────────────────────────────────────────────────
     7. INSPECTOR
  ───────────────────────────────────────────────────────── */

  function renderSelected() {
    const empty = $('#selectedEmpty');
    const body  = $('#selectedBody');
    const host  = $('#inspControls');

    if (!selection) { empty.hidden = false; body.hidden = true; return; }
    empty.hidden = true;
    body.hidden = false;
    host.innerHTML = '';

    if (selection.type === 'field' || selection.type === 'section') renderSectionInspector(host);
    else if (selection.type === 'setting') renderSettingInspector(host);
    else if (selection.type === 'media')   renderMediaInspector(host);
    else if (selection.type === 'row')     renderRowInspector(host);

    refreshReverts();
  }

  function setHead(crumb, title) {
    $('#inspCrumb').textContent = crumb;
    $('#inspTitle').textContent = title;
  }

  /* ── A section, or one field inside it ── */
  function renderSectionInspector(host) {
    const key = selection.key;
    const row = sectionOf(key);
    if (!row) {
      setHead('', 'Not editable');
      host.innerHTML = '<p class="muted">This part of the page is not stored as content.</p>';
      return;
    }

    setHead(selection.type === 'field'
      ? (FIELD_LABELS[selection.field] || selection.field)
      : 'Section', row.title || key);

    const before = origSection(key);
    const change = (col) => ({
      isChanged: () => before && String(row[col] ?? '') !== String(before[col] ?? ''),
      apply: () => { row[col] = before ? before[col] : row[col]; renderSelected(); },
    });

    /* Text fields, in the order they appear on the page. */
    SECTION_FIELDS.forEach(def => {
      if (row.kind === 'cards-projects' || row.kind === 'cards-certs') {
        if (def.k === 'body') return;   // the cards are the body
      }
      /* The quote template is only a heading and the quote itself, so
         offering the other fields would give you inputs that change
         nothing on the page. */
      if (row.layout === 'quote' && def.k !== 'title' && def.k !== 'body') return;

      const control = def.type === 'markdown'
        ? markdownInput(row[def.k], v => { row[def.k] = v; })
        : textInput(row[def.k], v => { row[def.k] = v; }, def.k === 'body');

      const wrap = fieldWrap(def.label, control, def.hint, change(def.k));
      wrap.dataset.fieldKey = def.k;
      host.appendChild(wrap);

      if (def.k === 'body') {
        const help = document.createElement('div');
        help.className = 'field__hint';
        help.textContent = 'Leave a blank line between paragraphs. The buttons above insert bullets and quotes for you.';
        wrap.appendChild(help);
      }
    });

    /* Section-level options. */
    const group = document.createElement('h2');
    group.className = 'group-title';
    group.textContent = 'Section options';
    host.appendChild(group);

    host.appendChild(fieldWrap('Menu label',
      textInput(row.nav_label, v => { row.nav_label = v; }),
      'The wording in the side menu', change('nav_label')));

    host.appendChild(fieldWrap('Background',
      selectInput(row.theme, [['dark', 'Dark'], ['cream', 'Light'], ['green', 'Green']],
        v => { row.theme = v; }), null, change('theme')));

    host.appendChild(fieldWrap('Visibility',
      checkboxInput(row.visible, 'Show this section on the site', v => { row.visible = v; renderOutline(); }),
      null, change('visible')));

    if (row.kind === 'story') {
      const addPhoto = document.createElement('button');
      addPhoto.className = 'btn btn--ghost btn--full';
      addPhoto.textContent = '+ Add a photo to this section';
      addPhoto.addEventListener('click', () => pickUpload(key));
      host.appendChild(addPhoto);
    }

    if (!row.is_builtin) {
      const del = document.createElement('button');
      del.className = 'btn btn--danger btn--full';
      del.textContent = 'Delete this section';
      del.addEventListener('click', () => deleteSection(key));
      host.appendChild(del);
    }

    /* Focus the field that was clicked. */
    if (selection.type === 'field') {
      const wrap = host.querySelector(`[data-field-key="${cssEscape(selection.field)}"]`);
      const input = wrap && (wrap.querySelector('textarea') || wrap.querySelector('input'));
      if (input) { input.focus(); input.scrollIntoView({ block: 'center' }); }
    }
  }

  /* ── A hero / settings value ── */
  function renderSettingInspector(host) {
    const def = HERO_FIELDS.concat(SEO_FIELDS).find(f => f.key === selection.key);
    setHead('Hero', def ? def.label : selection.key);

    const list = HERO_FIELDS.some(f => f.key === selection.key) ? HERO_FIELDS : SEO_FIELDS;
    list.forEach(f => {
      const wrap = fieldWrap(f.label,
        textInput(state.settings[f.key], v => { state.settings[f.key] = v; }, f.type === 'textarea'),
        f.hint,
        {
          isChanged: () => String(state.settings[f.key] ?? '') !== String((orig.settings || {})[f.key] ?? ''),
          apply: () => { state.settings[f.key] = orig.settings[f.key]; renderSelected(); },
        });
      wrap.dataset.fieldKey = f.key;
      host.appendChild(wrap);
    });

    const wrap = host.querySelector(`[data-field-key="${cssEscape(selection.key)}"]`);
    const input = wrap && (wrap.querySelector('textarea') || wrap.querySelector('input'));
    if (input) { input.focus(); input.scrollIntoView({ block: 'center' }); }
  }

  /* ── A photo ── */
  function renderMediaInspector(host) {
    const m = mediaOf(selection.id);
    if (!m) { setHead('', 'Photo not found'); return; }

    const section = sectionOf(m.section_key);
    setHead('Photo', (section && section.title) || m.section_key);

    const before = origMedia(m.id);
    const change = (col) => ({
      isChanged: () => before && String(m[col] ?? '') !== String(before[col] ?? ''),
      apply: () => { m[col] = before ? before[col] : m[col]; renderSelected(); },
    });

    const img = document.createElement('img');
    img.className = 'thumb-preview';
    img.src = m.image_url;
    img.alt = '';
    host.appendChild(img);

    host.appendChild(fieldWrap('Alt text',
      textInput(m.alt, v => { m.alt = v; }),
      'Describes the photo for screen readers and when the image fails to load',
      change('alt')));

    host.appendChild(fieldWrap('Style',
      selectInput(m.placement, [['collage', 'Floating photo'], ['gallery', 'Thumbnail strip']],
        v => { m.placement = v; renderSelected(); }),
      null, change('placement')));

    if (m.placement === 'gallery') {
      host.appendChild(fieldWrap('Caption',
        textInput(m.caption, v => { m.caption = v; }), null, change('caption')));
    } else {
      [
        { k: 'x',    label: 'Move left / right', min: -20, max: 100, step: 1,   suffix: '%' },
        { k: 'y',    label: 'Move up / down',    min: -20, max: 100, step: 1,   suffix: '%' },
        { k: 'w',    label: 'Size',              min: 10,  max: 100, step: 1,   suffix: '%' },
        { k: 'tilt', label: 'Tilt',              min: -15, max: 15,  step: 0.5, suffix: '°' },
      ].forEach(def => {
        host.appendChild(fieldWrap(def.label,
          rangeInput(m[def.k], def, v => { m[def.k] = parseFloat(v); }),
          null, change(def.k)));
      });

      host.appendChild(fieldWrap('Shape',
        textInput(m.aspect, v => { m.aspect = v; }),
        'Width to height, e.g. 16/9 for a wide photo or 1/1 for a square',
        change('aspect')));

      host.appendChild(fieldWrap('Type',
        checkboxInput(m.is_logo, 'Logo — fit inside instead of cropping', v => { m.is_logo = v; }),
        null, change('is_logo')));
    }

    const del = document.createElement('button');
    del.className = 'btn btn--danger btn--full';
    del.textContent = 'Remove this photo';
    del.addEventListener('click', () => {
      if (!confirm('Remove this photo from the page? The file stays in your storage.')) return;
      if (m.id) removed.media.push(m.id);
      state.media = state.media.filter(x => x !== m);
      deselect();
      markDirty();
    });
    host.appendChild(del);
  }

  /* ── A project or certificate card ── */
  function renderRowInspector(host) {
    const row = rowOf(selection.table, selection.id);
    if (!row) { setHead('', 'Card not found'); return; }

    const isProject = selection.table === 'projects';
    setHead(isProject ? 'Project' : 'Certificate', row.title || 'Untitled');

    const before = origRow(selection.table, selection.id);
    const change = (col) => ({
      isChanged: () => before && String(row[col] ?? '') !== String(before[col] ?? ''),
      apply: () => { row[col] = before ? before[col] : row[col]; renderSelected(); },
    });

    (isProject ? PROJECT_FIELDS : CERT_FIELDS).forEach(f => {
      host.appendChild(fieldWrap(f.label,
        textInput(row[f.k], v => { row[f.k] = v; }, f.type === 'textarea'),
        f.hint, change(f.k)));
    });

    const add = document.createElement('button');
    add.className = 'btn btn--ghost btn--full';
    add.textContent = isProject ? '+ Add another project' : '+ Add another certificate';
    add.addEventListener('click', () => addRow(selection.table));
    host.appendChild(add);

    const del = document.createElement('button');
    del.className = 'btn btn--danger btn--full';
    del.textContent = 'Delete this card';
    del.addEventListener('click', () => {
      if (!confirm(`Delete "${row.title || 'this card'}"?`)) return;
      if (row.id) removed[isProject ? 'projects' : 'certs'].push(row.id);
      const list = isProject ? state.projects : state.certs;
      const i = list.indexOf(row);
      if (i > -1) list.splice(i, 1);
      deselect();
      markDirty();
    });
    host.appendChild(del);
  }

  function addRow(table) {
    const isProject = table === 'projects';
    const list = isProject ? state.projects : state.certs;
    const row = isProject
      ? { title: 'New project', description: '', project_url: '', prototype_url: '',
          certificate_url: '', sort_order: (list.length + 1) * 10 }
      : { title: 'New certificate', issuer: '', pdf_url: '', link: '',
          sort_order: (list.length + 1) * 10 };
    list.push(row);
    markDirty();
    setSaveState('Added. Save to see it on the page.', 'ok');
  }

  /* Step through the fields of whatever is selected. */
  function stepField(dir) {
    const wraps = $$('#inspControls .field[data-field-key]');
    if (!wraps.length) return;
    const active = document.activeElement;
    let index = wraps.findIndex(w => w.contains(active));
    if (index === -1) index = dir > 0 ? -1 : wraps.length;
    const next = wraps[Math.min(Math.max(index + dir, 0), wraps.length - 1)];
    const input = next && (next.querySelector('textarea') || next.querySelector('input'));
    if (input) { input.focus(); input.scrollIntoView({ block: 'center' }); }
  }


  /* ─────────────────────────────────────────────────────────
     8. OUTLINE — order, visibility, add, delete
  ───────────────────────────────────────────────────────── */

  function renderOutline() {
    const host = $('#sectionList');
    host.innerHTML = '';

    state.sections
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .forEach(row => {
        const el = document.createElement('div');
        el.className = 'sec-row' + (row.visible ? '' : ' is-hidden');
        el.dataset.key = row.key;

        const grip = document.createElement('span');
        grip.className = 'sec-row__grip';
        grip.textContent = '⠿';
        grip.draggable = true;
        grip.title = 'Drag to reorder';

        const name = document.createElement('button');
        name.className = 'sec-row__name';
        name.textContent = row.title || row.key;
        name.addEventListener('click', () => select({ type: 'section', key: row.key }));

        const eye = document.createElement('button');
        eye.className = 'icon-btn';
        eye.textContent = row.visible ? '👁' : '🚫';
        eye.title = row.visible ? 'Hide this section' : 'Show this section';
        eye.addEventListener('click', () => {
          row.visible = !row.visible;
          renderOutline();
          markDirty();
        });

        el.appendChild(grip);
        el.appendChild(name);
        if (row.is_builtin) {
          const lock = document.createElement('span');
          lock.className = 'sec-row__lock';
          lock.textContent = 'built in';
          lock.title = 'Can be hidden and reordered, but not deleted';
          el.appendChild(lock);
        }
        el.appendChild(eye);
        host.appendChild(el);
      });

    enableDragReorder(host);
    markOutlineSelection();
  }

  function markOutlineSelection() {
    const key = selection && (selection.key || null);
    $$('#sectionList .sec-row').forEach(r => {
      r.classList.toggle('selected', !!key && r.dataset.key === key);
    });
  }

  function enableDragReorder(host) {
    let dragging = null;

    $$('.sec-row', host).forEach(rowEl => {
      const grip = rowEl.querySelector('.sec-row__grip');
      if (!grip) return;

      grip.addEventListener('dragstart', (e) => {
        dragging = rowEl;
        rowEl.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        /* Firefox refuses to start a drag with no data attached. */
        e.dataTransfer.setData('text/plain', rowEl.dataset.key || '');
      });

      grip.addEventListener('dragend', () => {
        rowEl.classList.remove('dragging');
        $$('.sec-row', host).forEach(r => r.classList.remove('drag-over'));
        dragging = null;
        $$('.sec-row', host).forEach((r, i) => {
          const row = sectionOf(r.dataset.key);
          if (row) row.sort_order = (i + 1) * 10;
        });
        markDirty();
      });

      rowEl.addEventListener('dragover', (e) => {
        if (!dragging || dragging === rowEl) return;
        e.preventDefault();
        rowEl.classList.add('drag-over');
        const rect = rowEl.getBoundingClientRect();
        const after = (e.clientY - rect.top) > rect.height / 2;
        host.insertBefore(dragging, after ? rowEl.nextSibling : rowEl);
      });

      rowEl.addEventListener('dragleave', () => rowEl.classList.remove('drag-over'));
      rowEl.addEventListener('drop', (e) => e.preventDefault());
    });
  }

  function addSection(layout) {
    const maxOrder = state.sections.reduce((m, s) => Math.max(m, s.sort_order || 0), 0);
    const row = {
      key: 'section-' + Date.now().toString(36),
      kind: 'story',
      layout,
      nav_label: 'New section',
      meta: '',
      title: 'New section',
      role: '',
      tagline: '',
      body: layout === 'quote'
        ? 'The line you want people to remember.'
        : 'Write about this part of your story here.',
      theme: 'dark',
      sort_order: maxOrder + 10,
      visible: true,
      is_builtin: false,
    };
    state.sections.push(row);
    renderOutline();
    select({ type: 'section', key: row.key });
    markDirty();
    setSaveState('Section added. Save to see it on the page.', 'ok');
  }

  function deleteSection(key) {
    const row = sectionOf(key);
    if (!row) return;

    if (row.is_builtin) {
      if (confirm(`"${row.title}" is built into the site and cannot be deleted, because it holds ` +
                  `things a plain section cannot (a card grid or a form).\n\nHide it instead?`)) {
        row.visible = false;
        renderOutline();
        renderSelected();
        markDirty();
      }
      return;
    }

    if (!confirm(`Delete "${row.title}" and everything in it?\n\nIf you only want it off the page ` +
                 `for now, cancel and untick "Show this section" instead.`)) return;

    if (row.id) removed.sections.push(row.id);
    state.sections = state.sections.filter(s => s.key !== key);
    state.media = state.media.filter(m => {
      if (m.section_key !== key) return true;
      if (m.id) removed.media.push(m.id);
      return false;
    });
    deselect();
    renderOutline();
    markDirty();
  }


  /* ─────────────────────────────────────────────────────────
     9. DESIGN AND SETTINGS
  ───────────────────────────────────────────────────────── */

  function renderTheme() {
    const host = $('#themeFields');
    host.innerHTML = '';

    THEME_FIELDS.forEach(def => {
      const set = v => { state.theme[def.key] = v; };
      let control;
      if (def.type === 'color')      control = colorInput(state.theme[def.key], set);
      else if (def.type === 'range') control = rangeInput(state.theme[def.key], def, set);
      else if (def.type === 'font')  control = selectInput(state.theme[def.key], FONT_CHOICES, set);
      else                           control = textInput(state.theme[def.key], set);

      host.appendChild(fieldWrap(def.label, control, def.hint, {
        isChanged: () => String(state.theme[def.key] ?? '') !== String((orig.theme || {})[def.key] ?? ''),
        apply: () => { state.theme[def.key] = orig.theme[def.key]; renderTheme(); refreshReverts(); },
      }));
    });
  }

  function renderSettingFields(hostSel, defs) {
    const host = $(hostSel);
    host.innerHTML = '';
    defs.forEach(def => {
      host.appendChild(fieldWrap(def.label,
        textInput(state.settings[def.key], v => { state.settings[def.key] = v; renderWarnings(); },
          def.type === 'textarea'),
        def.hint,
        {
          isChanged: () => String(state.settings[def.key] ?? '') !== String((orig.settings || {})[def.key] ?? ''),
          apply: () => { state.settings[def.key] = orig.settings[def.key]; renderSettingFields(hostSel, defs); refreshReverts(); },
        }));
    });
  }

  /** Non-blocking nudges. Nothing here prevents saving. */
  function renderWarnings() {
    const host = $('#warnings');
    if (!host) return;
    host.innerHTML = '';
    const notes = [];

    if (!state.settings['cv.url']) {
      notes.push('No CV file set, so the Download CV button stays hidden. Recruiters look for it.');
    }
    const noAlt = state.media.filter(m => !m.alt || !m.alt.trim()).length;
    if (noAlt) notes.push(`${noAlt} photo${noAlt > 1 ? 's have' : ' has'} no alt text.`);

    const untitled = state.sections.filter(s => !s.title || !s.title.trim()).length;
    if (untitled) notes.push(`${untitled} section${untitled > 1 ? 's have' : ' has'} no title.`);

    const desc = state.settings['seo.description'] || '';
    if (desc.length > 165) notes.push('The search description is long; Google usually cuts it near 160 characters.');

    if (!notes.length) {
      const ok = document.createElement('div');
      ok.className = 'warn warn--ok';
      ok.textContent = 'Nothing to flag.';
      host.appendChild(ok);
      return;
    }
    notes.forEach(text => {
      const el = document.createElement('div');
      el.className = 'warn';
      el.textContent = text;
      host.appendChild(el);
    });
  }

  /* ── Image upload ── */
  function pickUpload(sectionKey) {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.addEventListener('change', () => {
      const file = input.files && input.files[0];
      if (file) handleUpload(file, sectionKey);
    });
    input.click();
  }

  async function handleUpload(file, sectionKey) {
    setSaveState('Uploading…');

    /* Timestamped name: re-uploading the same filename would collide,
       and Storage rejects duplicates by default. */
    const safe = file.name.replace(/[^a-zA-Z0-9._-]/g, '-');
    const path = `site/${Date.now()}-${safe}`;

    const { error } = await db.storage.from('Assets').upload(path, file, {
      cacheControl: '3600', upsert: false,
    });
    if (error) { setSaveState('Upload failed: ' + error.message, 'error'); return; }

    const { data } = db.storage.from('Assets').getPublicUrl(path);
    const section = sectionOf(sectionKey);
    const count = state.media.filter(m => m.section_key === sectionKey).length;

    state.media.push({
      section_key: sectionKey,
      placement: section && section.layout === 'gallery' && count >= 3 ? 'gallery' : 'collage',
      image_url: data.publicUrl,
      alt: '', caption: '',
      x: 12, y: 24, w: 60, tilt: 0,
      aspect: '4/3', delay: 0, is_logo: false,
      sort_order: (count + 1) * 10,
    });

    setSaveState('Uploaded. Save to see it on the page.', 'ok');
    markDirty();
  }


  /* ─────────────────────────────────────────────────────────
     10. SAVE
  ───────────────────────────────────────────────────────── */

  function countChanges() {
    if (!orig) return 0;
    let n = 0;

    state.sections.forEach(s => {
      const o = orig.sections.find(x => x.key === s.key);
      if (!o) { n++; return; }
      SECTION_COLS.forEach(c => { if (String(s[c] ?? '') !== String(o[c] ?? '')) n++; });
    });
    n += removed.sections.length;

    Object.keys(state.settings).forEach(k => {
      if (String(state.settings[k] ?? '') !== String((orig.settings || {})[k] ?? '')) n++;
    });
    Object.keys(state.theme).forEach(k => {
      if (String(state.theme[k] ?? '') !== String((orig.theme || {})[k] ?? '')) n++;
    });

    state.media.forEach(m => {
      const o = orig.media.find(x => String(x.id) === String(m.id));
      if (!o) { n++; return; }
      MEDIA_COLS.forEach(c => { if (String(m[c] ?? '') !== String(o[c] ?? '')) n++; });
    });
    n += removed.media.length;

    [['projects', PROJECT_FIELDS], ['certs', CERT_FIELDS]].forEach(([key, fields]) => {
      state[key].forEach(r => {
        const o = orig[key].find(x => String(x.id) === String(r.id));
        if (!o) { n++; return; }
        fields.concat([{ k: 'sort_order' }]).forEach(f => {
          if (String(r[f.k] ?? '') !== String(o[f.k] ?? '')) n++;
        });
      });
    });
    n += removed.projects.length + removed.certs.length;

    return n;
  }

  function updateUnsaved() {
    const n = countChanges();
    const bar = $('#unsavedBar');
    bar.hidden = n === 0;
    $('#unsavedCount').textContent =
      n === 1 ? '1 unsaved change' : `${n} unsaved changes`;
  }

  function markDirty() {
    updateUnsaved();
    renderWarnings();
  }

  function setSaveState(text, kind) {
    const el = $('#saveState');
    el.textContent = text;
    el.className = 'save-state' + (kind ? ' ' + kind : '');
  }

  async function saveAll() {
    const btn = $('#saveAll');
    btn.disabled = true;
    setSaveState('Saving…');

    /* Reloading the preview would otherwise throw away your place and
       your selection on every save, which gets painful fast. */
    pendingRestore = { scroll: (previewWin() && previewWin().scrollY) || 0, selection };

    try {
      const jobs = [];
      const stamp = new Date().toISOString();

      const sectionsExisting = state.sections.filter(s => s.id);
      const sectionsNew      = state.sections.filter(s => !s.id);
      if (sectionsExisting.length) {
        jobs.push(db.from('site_sections')
          .upsert(sectionsExisting.map(s => Object.assign({}, s, { updated_at: stamp })),
                  { onConflict: 'key' }));
      }
      if (sectionsNew.length) {
        jobs.push(db.from('site_sections')
          .insert(sectionsNew.map(s => Object.assign({}, s, { updated_at: stamp }))));
      }

      const settingRows = Object.keys(state.settings)
        .map(key => ({ key, value: state.settings[key], updated_at: stamp }));
      if (settingRows.length) jobs.push(db.from('site_settings').upsert(settingRows, { onConflict: 'key' }));

      const themeRows = Object.keys(state.theme)
        .filter(key => state.theme[key] !== '' && state.theme[key] != null)
        .map(key => ({ key, value: String(state.theme[key]), updated_at: stamp }));
      if (themeRows.length) jobs.push(db.from('site_theme').upsert(themeRows, { onConflict: 'key' }));

      pushRows(jobs, 'site_media', state.media);
      pushRows(jobs, 'projects', state.projects);
      pushRows(jobs, 'certificates', state.certs);

      if (removed.sections.length) jobs.push(db.from('site_sections').delete().in('id', removed.sections));
      if (removed.media.length)    jobs.push(db.from('site_media').delete().in('id', removed.media));
      if (removed.projects.length) jobs.push(db.from('projects').delete().in('id', removed.projects));
      if (removed.certs.length)    jobs.push(db.from('certificates').delete().in('id', removed.certs));

      const results = await Promise.all(jobs);
      const failed = results.find(r => r && r.error);
      if (failed) throw failed.error;

      removed.sections = []; removed.media = []; removed.projects = []; removed.certs = [];

      /* site-content.js caches published content, so clear it or the
         preview and the live site both show the previous version. */
      try { localStorage.removeItem('siteContentCache.v1'); } catch { /* private mode */ }

      await loadAll();
      renderOutline();
      renderTheme();
      renderSettingFields('#seoFields', SEO_FIELDS);
      renderWarnings();
      updateUnsaved();
      setSaveState('Saved. Your live site is updated.', 'ok');
      refreshPreview();

    } catch (err) {
      console.error(err);
      const hint = /row-level security/i.test(err.message || '')
        ? ' — this account is not the owner set in admin-schema.sql'
        : '';
      setSaveState('Save failed: ' + (err.message || err) + hint, 'error');
      pendingRestore = null;
      btn.disabled = false;
    }
  }

  function pushRows(jobs, table, rows) {
    const existing = rows.filter(r => r.id);
    const fresh    = rows.filter(r => !r.id);
    if (existing.length) jobs.push(db.from(table).upsert(existing));
    if (fresh.length)    jobs.push(db.from(table).insert(fresh));
  }

  function refreshPreview() {
    $('#previewFrame').src = 'index.html?preview=' + Date.now();
  }

  function restoreAfterSave() {
    if (!pendingRestore) return;
    const { scroll, selection: sel } = pendingRestore;
    pendingRestore = null;

    const win = previewWin();
    if (win) win.scrollTo(0, scroll);

    if (sel) {
      selection = sel;
      renderSelected();
      highlightSelected();
      markOutlineSelection();
    }
    $('#saveAll').disabled = false;
  }


  /* ─────────────────────────────────────────────────────────
     11. WALKTHROUGH
  ───────────────────────────────────────────────────────── */

  const TOUR = [
    { title: 'Click anything to edit it',
      body: 'Move your pointer over the preview on the left. Anything you can change is outlined, ' +
            'with a label saying what it is. Click to open it.' },
    { title: 'The panel on the right follows you',
      body: 'Whatever you click appears here with all its options: the wording, the colours, ' +
            'where a photo sits. Nothing is buried in menus.' },
    { title: 'Browse mode when you want to test',
      body: 'Clicking normally selects things instead of following links. Switch to Browse in the ' +
            'top bar to use the site for real: the menu, the buttons, the contact form.' },
    { title: 'Saving publishes straight away',
      body: 'There is no separate deploy step. Press Save and publish, and the live site shows your ' +
            'changes to everyone within seconds.' },
  ];
  let tourIndex = 0;

  function maybeStartTour() {
    let seen = null;
    try { seen = localStorage.getItem('adminTourSeen'); } catch { /* private mode */ }
    if (!seen) startTour();
  }

  function startTour() {
    tourIndex = 0;
    $('#tourModal').hidden = false;
    renderTourStep();
  }

  function renderTourStep() {
    const step = TOUR[tourIndex];
    $('#tourStep').textContent = `Step ${tourIndex + 1} of ${TOUR.length}`;
    $('#tourTitle').textContent = step.title;
    $('#tourBody').textContent = step.body;
    $('#tourNext').textContent = tourIndex === TOUR.length - 1 ? 'Start editing' : 'Next';
  }

  function endTour() {
    $('#tourModal').hidden = true;
    try { localStorage.setItem('adminTourSeen', '1'); } catch { /* private mode */ }
  }


  /* ─────────────────────────────────────────────────────────
     12. CHROME
  ───────────────────────────────────────────────────────── */

  function showTab(name) {
    $$('.insp-tab').forEach(t => t.classList.toggle('active', t.dataset.insp === name));
    $$('.insp-panel').forEach(p => p.classList.toggle('active', p.dataset.panel === name));
  }

  function setMode(next) {
    mode = next;
    $$('.mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === next));

    const doc = previewDoc();
    if (doc) {
      $$('.__ed-hover', doc).forEach(el => el.classList.remove('__ed-hover'));
      const chip = doc.getElementById('__edLabel');
      if (chip) chip.hidden = true;
    }
  }

  function wireChrome() {
    if (wireChrome.done) return;
    wireChrome.done = true;

    $$('.insp-tab').forEach(tab => {
      tab.addEventListener('click', () => showTab(tab.dataset.insp));
    });

    $('#logout').addEventListener('click', async () => {
      await db.auth.signOut();
      location.reload();
    });

    $('#deselect').addEventListener('click', deselect);
    $('#stepPrev').addEventListener('click', () => stepField(-1));
    $('#stepNext').addEventListener('click', () => stepField(1));

    $('#saveAll').addEventListener('click', saveAll);
    $('#discardAll').addEventListener('click', () => {
      if (confirm('Throw away every unsaved change?')) location.reload();
    });

    $('#addSection').addEventListener('click', () => { $('#layoutModal').hidden = false; });
    $('#layoutCancel').addEventListener('click', () => { $('#layoutModal').hidden = true; });
    $$('.layout-card').forEach(card => {
      card.addEventListener('click', () => {
        $('#layoutModal').hidden = true;
        addSection(card.dataset.layout);
      });
    });

    $('#themeReset').addEventListener('click', () => {
      if (!confirm('Reset every design value to the built-in defaults?')) return;
      db.from('site_theme').delete().in('key', THEME_FIELDS.map(f => f.key))
        .then(() => {
          try { localStorage.removeItem('siteContentCache.v1'); } catch { /* private mode */ }
          location.reload();
        });
    });

    $$('.mode-btn').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));

    $$('.size-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        $$('.size-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        $('#previewFrame').style.width = btn.dataset.w;
      });
    });

    $('#flattenToggle').addEventListener('change', (e) => {
      applyFlatten(previewDoc(), e.target.checked);
    });

    $('#helpBtn').addEventListener('click', startTour);
    $('#tourSkip').addEventListener('click', endTour);
    $('#tourNext').addEventListener('click', () => {
      if (tourIndex === TOUR.length - 1) { endTour(); return; }
      tourIndex++;
      renderTourStep();
    });

    document.addEventListener('keydown', (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        if (countChanges()) saveAll();
        return;
      }
      if (e.key === 'Escape') {
        if (!$('#layoutModal').hidden) { $('#layoutModal').hidden = true; return; }
        if (!$('#tourModal').hidden)   { endTour(); return; }
        deselect();
      }
    });

    window.addEventListener('beforeunload', (e) => {
      if (countChanges()) { e.preventDefault(); e.returnValue = ''; }
    });
  }

  initAuth();
})();
