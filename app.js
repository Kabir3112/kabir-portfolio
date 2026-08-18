/* ============================================================
   KABIR MEHTA — PORTFOLIO  |  app.js
   ============================================================
   Table of contents:
   1.  Config — Supabase
   2.  State & helpers
   3.  Story-block scroll architecture (image bottom-to-top)
   4.  Section reveal (IntersectionObserver)
   5.  Progress bar
   6.  Timeline nav, hero jump buttons, CV link
   7.  Mobile menu
   8.  Supabase — load projects
   9.  Supabase — load certificates
   10. Contact form (Supabase)
   11. Newsletter form
   12. Boot
   ============================================================ */


/* ─────────────────────────────────────────────────────────────
   1. CONFIG — SUPABASE
   Values are injected by config.js (loaded before this script).
   See config.example.js for the template.
───────────────────────────────────────────────────────────── */
const SUPABASE_URL      = window.SUPABASE_URL;
const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY;

/* Null when config.js or the supabase-js CDN script failed to load —
   loaders below fall back to static content instead of crashing.

   Memoised on window because site-content.js needs a client too, and
   two createClient() calls in one page share the same auth storage key
   — which supabase-js warns about ("Multiple GoTrueClient instances")
   and treats as undefined behaviour under concurrent use. Whichever
   file gets there first builds it; the other reuses it. */
const db = (function () {
  if (window.__sbClient) return window.__sbClient;
  if (!(window.supabase && SUPABASE_URL && SUPABASE_ANON_KEY)) return null;
  window.__sbClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  return window.__sbClient;
})();


/* ─────────────────────────────────────────────────────────────
   2. STATE & HELPERS
───────────────────────────────────────────────────────────── */
let sections          = [];  // { el, inner } for all .panel elements
let sectionScrollTops = new Map(); // cached absolute scroll positions
let scrollRAF         = null;

/* Tell the stylesheet that JS is alive, so .panel-inner may start
   hidden and animate in. Set at parse time rather than in boot() so
   the panels never flash visible first. Reduced motion keeps the
   readable defaults. */
if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  document.documentElement.classList.add('js-motion');
}

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

/* Scroll effects are desktop-only. On a phone the dwell and the parallax
   are pure cost: NN/G's scrolljacking study found small screens and
   touch-only input make altered scroll behaviour markedly more
   disorienting, and a section that holds for an extra 20vh on desktop
   feels like a stuck page on mobile. Below this width every panel is a
   plain 100vh block in normal document flow. */
const MOTION_MIN_WIDTH = 768;
const motionEnabled = () =>
  !prefersReducedMotion.matches && window.innerWidth >= MOTION_MIN_WIDTH;

/* Dwell — how far you scroll while a section is pinned.
   Deliberately small. Dwell buys animation room, not content: every extra
   vh here is scrolling that delivers no new information, and the page was
   previously 22 screen-heights deep because of it. Sections that genuinely
   overflow still get the room they need, measured at runtime in
   setStoryBlockHeights(). `depth` and `textLead` stay per-section because
   those are motion character, not pacing.

   Overridable from the admin via the `dwell-vh` theme token, which
   site-content.js parks on window.__siteTokens. Read through a function
   rather than captured in a const because the token arrives after this
   file is evaluated. */
const DEFAULT_DWELL_VH = 20;

function baseDwellVh() {
  const raw = window.__siteTokens && window.__siteTokens['dwell-vh'];
  const n = parseFloat(raw);
  return Number.isFinite(n) && n >= 0 ? n : DEFAULT_DWELL_VH;
}

const SECTION_MOTION = {
  'childhood':          { depth: 10, textLead: 0.02 },
  'christ':             { depth: 10, textLead: 0.03 },
  'finiq':              { depth: 16, textLead: 0.00 },
  'kings':              { depth: 10, textLead: 0.03 },
  'dissertation':       { depth: 10, textLead: 0.03 },
  'personal':           { depth: 8,  textLead: 0.04 },
  'projects':           { depth: 16, textLead: 0.00, cards: true },
  'certificates':       { depth: 14, textLead: 0.00, cards: true },
  'newsletter-section': { depth: 14, textLead: 0.00 },
  'contact':            { depth: 8,  textLead: 0.02 },
};

/* ── CV ───────────────────────────────────────────────────────
   Drop a PDF next to index.html and put its filename here to turn
   on the "Download CV" button in the hero. Left empty the button is
   removed rather than left pointing at a 404. */
const CV_URL = 'Kabir_Mehta_Resume.pdf';

function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#39;');
}

/**
 * Get the absolute document scroll-top position of an element.
 * Works at page-load time (scrollY = 0) by using getBoundingClientRect.
 * Also works mid-scroll because rect.top + scrollY = absolute position.
 */
function getAbsoluteTop(el) {
  return el.getBoundingClientRect().top + window.scrollY;
}

function clamp(value, min = 0, max = 1) {
  return Math.min(Math.max(value, min), max);
}

function lerp(start, end, amount) {
  return start + (end - start) * amount;
}

function easeOutCubic(value) {
  const x = clamp(value);
  return 1 - Math.pow(1 - x, 3);
}

function easeInOutSine(value) {
  const x = clamp(value);
  return -(Math.cos(Math.PI * x) - 1) / 2;
}

function getSectionMotion(id) {
  return SECTION_MOTION[id] || {};
}

function wrapRevealLines(el) {
  if (!el || el.dataset.revealReady === 'true') return;

  const html = el.innerHTML.trim();
  if (!html) return;

  const lines = html.split(/<br\s*\/?>/i).map(line => line.trim()).filter(Boolean);
  const finalLines = lines.length ? lines : [html];

  el.innerHTML = finalLines.map(line =>
    `<span class="text-reveal-line"><span class="text-reveal-inner">${line}</span></span>`
  ).join('');
  el.dataset.revealReady = 'true';
}

function prepareTextReveals(root = document) {
  root.querySelectorAll('.panel-title, .panel-tagline, .name-line').forEach(wrapRevealLines);
}

function updateRevealElement(el, progress, baseDelay = 0) {
  if (!el) return;

  const lines = el.querySelectorAll('.text-reveal-line');
  if (!lines.length) return;

  lines.forEach((line, index) => {
    const lineProgress = easeOutCubic(clamp((progress - baseDelay) * 2.2 - index * 0.12));
    line.style.setProperty('--line-reveal', lineProgress.toFixed(3));
  });
}

function prepareCardMotion(container) {
  if (!container) return;
  container.querySelectorAll('.tl-card').forEach((card, index) => {
    card.style.setProperty('--card-index', String(index));
  });
}

/* ─────────────────────────────────────────────────────────────
   3. STORY-BLOCK SCROLL ARCHITECTURE
   ─────────────────────────────────────────────────────────────
   Each .story-block wraps a sticky .panel and has extra height
   (data-extra-vh attribute) to give the image animation room.

   As the user scrolls through the extra space, JS calculates
   a 0–1 progress value and drives the image-scroll-inner
   translateY from +zoneHeight (below) to −(innerH−offset) (above).

   Timing:
     - First 12 % of scroll range = 1–2 s "landing pause"
     - Remaining 88 % = smooth bottom-to-top image reveal
───────────────────────────────────────────────────────────── */

/**
 * Set story-block heights, which is what controls scroll pacing.
 *
 * Every section gets the same BASE_DWELL_VH so equal wheel movement
 * always buys equal content. A card section gets extra room only if
 * its content genuinely overflows the viewport — measured here rather
 * than guessed — so it holds for exactly as long as it needs and no
 * longer. This is what removes the "stalling" on Projects/Certificates.
 *
 * `data-extra-vh` in the markup is still honoured as a deliberate
 * author override, but nothing relies on it for normal pacing.
 */
function setStoryBlockHeights() {
  /* Heights below are written in `vh`, so the overflow must be converted
     against the same reference the CSS unit uses. On mobile the visual
     viewport (window.innerHeight) and the CSS vh reference disagree —
     measured 992 vs 812 on a phone — which would scale the added room
     wrongly. documentElement.clientHeight tracks the CSS unit. */
  const vh = document.documentElement.clientHeight || window.innerHeight;

  /* Mobile / reduced motion: no dwell at all. The blocks collapse to their
     content height and the panels stop being sticky (see the CSS media
     query), so the page reads as an ordinary document. */
  if (!motionEnabled()) {
    document.querySelectorAll('.story-block').forEach(block => {
      block.style.height = '';
    });
    return;
  }

  document.querySelectorAll('.story-block').forEach(block => {
    const panel = block.querySelector('.panel');
    if (!panel) return;

    let extra = baseDwellVh();

    // Card sections: add only the overflow they actually have.
    const inner = panel.querySelector('.panel-inner');
    if (inner) {
      const overflow = inner.scrollHeight - panel.clientHeight;
      if (overflow > 0) extra += Math.ceil((overflow / vh) * 100);
    }

    // Explicit override wins, but only upward — never shorten a section
    // below the room its own content needs.
    const declared = parseFloat(block.dataset.extraVh);
    if (Number.isFinite(declared)) extra = Math.max(extra, declared);

    block.style.height = `${100 + extra}vh`;
  });
}

/** rAF-throttled scroll handler */
function onScroll() {
  if (scrollRAF) return;
  scrollRAF = requestAnimationFrame(() => {
    updateProgressBar();
    updateActiveNav();
    updateParallax();
    scrollRAF = null;
  });
}

function initScrollStory() {
  prepareTextReveals();
  setStoryBlockHeights();

  window.addEventListener('scroll', onScroll, { passive: true });

  // Recalculate on resize
  window.addEventListener('resize', () => {
    setStoryBlockHeights();
    computeSectionPositions();
    updateParallax();
  }, { passive: true });
}

/**
 * Content parallax — as the user scrolls through a section, its
 * panel-inner drifts upward (--p-y CSS custom property).
 * Uses the CSS `translate` property so it composes independently
 * from the entrance `transform` animation.
 */
function updateParallax() {
  if (!motionEnabled()) {
    updateHeroSequence(true);
    sections.forEach(({ el, inner }) => {
      el.style.setProperty('--panel-stage-y', '0px');
      el.style.setProperty('--panel-stage-x', '0px');
      el.style.setProperty('--panel-stage-scale', '1');
      el.style.setProperty('--panel-stage-rotate', '0deg');
      el.style.setProperty('--panel-stage-opacity', '1');
      el.style.setProperty('--panel-progress', '1');
      inner?.classList.add('in-view');
      if (inner) {
        inner.style.setProperty('--panel-opacity', '1');
        inner.style.setProperty('--panel-shift-y', '0px');
        inner.style.setProperty('--panel-scale', '1');
        inner.style.setProperty('--panel-blur', '0px');
      }
      updateRevealElement(el.querySelector('.panel-title'), 1);
      updateRevealElement(el.querySelector('.panel-tagline'), 1);
    });
    document.querySelectorAll('.tl-card').forEach(card => {
      card.style.setProperty('--card-opacity', '1');
      card.style.setProperty('--card-y', '0px');
      card.style.setProperty('--card-scale', '1');
      card.style.setProperty('--card-rotate', '0deg');
    });
    return;
  }

  updateHeroSequence();

  const viewportH = window.innerHeight;
  const viewportCenter = window.scrollY + viewportH * 0.52;

  sections.forEach(({ el, inner }) => {
    if (!inner) return;

    const block = el.closest('.story-block') || el;
    const blockTop = sectionScrollTops.get(el.id) ?? getAbsoluteTop(block);
    const blockH = block.offsetHeight || viewportH;
    const motion = getSectionMotion(el.id);
    const depth = motion.depth ?? (block.classList.contains('story-block') ? 18 : 12);

    const travelStart = blockTop - viewportH * 0.74;
    const travelEnd = blockTop + blockH - viewportH * 0.12;
    const progress = clamp((window.scrollY - travelStart) / Math.max(travelEnd - travelStart, 1));
    const settle = easeOutCubic(clamp(progress / 0.16));
    const hold = clamp((progress - 0.16) / 0.56);
    const exit = easeInOutSine(clamp((progress - 0.78) / 0.18));
    const focusDistance = Math.abs((blockTop + blockH * 0.5) - viewportCenter);
    const focus = clamp(1 - focusDistance / (viewportH * 0.9));

    const panelEnterY = lerp(18, 0, settle);
    const panelExitY = lerp(0, -8, exit);
    const panelY = panelEnterY + panelExitY;
    const panelEnterX = lerp(-88, 0, settle);
    const panelExitX = lerp(0, 108, exit);
    const panelX = panelEnterX + panelExitX;
    const panelScale = progress < 0.78 ? lerp(1.018, 1, settle) : lerp(1, 0.992, exit);
    const panelRotate = progress < 0.74 ? lerp(-12, 0, settle) : lerp(0, 16, exit);
    const panelOpacity = progress < 0.9
      ? clamp(0.86 + settle * 0.14 + focus * 0.04, 0, 1)
      : clamp(1 - ((progress - 0.9) / 0.1) * 0.14, 0.86, 1);

    const entranceY = lerp(28, 0, settle);
    const holdDrift = lerp(depth * 0.28, -depth * 0.18, hold);
    const exitY = lerp(0, -10, exit);
    const totalY = entranceY + holdDrift + exitY;
    const opacity = clamp(0.18 + settle * 0.82 + focus * 0.03, 0, 1);
    const scale = 1;

    el.style.setProperty('--panel-stage-y', `${panelY.toFixed(2)}px`);
    el.style.setProperty('--panel-stage-x', `${panelX.toFixed(2)}px`);
    el.style.setProperty('--panel-stage-scale', panelScale.toFixed(3));
    el.style.setProperty('--panel-stage-rotate', `${panelRotate.toFixed(2)}deg`);
    el.style.setProperty('--panel-stage-opacity', panelOpacity.toFixed(3));
    el.style.setProperty('--panel-progress', progress.toFixed(3));

    inner.classList.toggle('in-view', progress > 0.02);
    inner.style.setProperty('--panel-progress', progress.toFixed(3));
    inner.style.setProperty('--panel-opacity', opacity.toFixed(3));
    inner.style.setProperty('--panel-shift-y', `${totalY.toFixed(2)}px`);
    inner.style.setProperty('--panel-scale', scale.toFixed(3));
    inner.style.setProperty('--panel-blur', '0px');

    const title = el.querySelector('.panel-title');
    const tagline = el.querySelector('.panel-tagline');
    const textLead = motion.textLead ?? 0.08;
    updateRevealElement(title, clamp((progress - textLead) / 0.16));
    updateRevealElement(tagline, clamp((progress - (textLead + 0.05)) / 0.14));

    const cardsContainer = el.querySelector('.cards-grid');
    if (motion.cards && cardsContainer) {
      cardsContainer.querySelectorAll('.tl-card').forEach((card, index) => {
        const base = clamp(((progress - 0.08) / 0.18) - index * 0.08);
        const cardProgress = easeOutCubic(base);
        card.style.setProperty('--card-opacity', clamp(0.25 + cardProgress * 0.75).toFixed(3));
        card.style.setProperty('--card-y', `${lerp(24, 0, cardProgress).toFixed(2)}px`);
        card.style.setProperty('--card-scale', lerp(0.985, 1, cardProgress).toFixed(3));
        card.style.setProperty('--card-rotate', `${lerp(1.5, 0, cardProgress).toFixed(2)}deg`);
      });
    }
  });
}

/**
 * Hero exit.
 *
 * The hero used to be two panels: an avatar-only screen, then a separate
 * About panel whose name, role and copy were revealed by scroll progress
 * and then auto-scrolled away on a 10s timer. Nothing above the fold said
 * who this was. The hero now renders its content immediately and this
 * function only handles its exit — it fades as you leave, and that is all.
 */
function updateHeroSequence(forceComplete = false) {
  const hero = document.getElementById('hero');
  if (!hero) return;

  const avatar = document.getElementById('introAvatar');
  const indicator = hero.querySelector('.scroll-indicator');
  const quip = hero.querySelector('.avatar-quip');

  const viewportH = window.innerHeight;
  const exit = forceComplete ? 0 : easeInOutSine(clamp(window.scrollY / Math.max(viewportH * 0.8, 1)));

  avatar?.style.setProperty('--avatar-screen-x', '0px');
  avatar?.style.setProperty('--avatar-screen-y', `${lerp(0, -18, exit).toFixed(2)}px`);
  avatar?.style.setProperty('--avatar-screen-scale', lerp(1, 0.94, exit).toFixed(3));
  avatar?.style.setProperty('--hero-avatar-tilt', `${lerp(0, -5, exit).toFixed(2)}deg`);
  quip?.style.setProperty('--hero-quip-opacity', clamp(1 - exit * 1.6).toFixed(3));
  indicator?.style.setProperty('--hero-indicator-opacity', clamp(1 - exit * 2.2).toFixed(3));
}


/* ─────────────────────────────────────────────────────────────
   4. SECTION REVEAL — IntersectionObserver
   .panel-inner and .panel-text.panel-inner fade up on entry.
───────────────────────────────────────────────────────────── */
function initReveal() {
  if (prefersReducedMotion.matches) {
    document.querySelectorAll('.panel-inner').forEach(el => el.classList.add('in-view'));
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      entry.target.classList.toggle('in-view', entry.isIntersecting);
    });
  }, { threshold: 0.08 });

  document.querySelectorAll('.panel-inner').forEach(el => {
    const panel = el.closest('.panel');
    if (panel && panel.id === 'hero') return;
    observer.observe(el);
  });
}

/* ─────────────────────────────────────────────────────────────
   6. PROGRESS BAR
───────────────────────────────────────────────────────────── */
const progressBar = document.getElementById('progress-bar');

function updateProgressBar() {
  if (!progressBar) return;
  const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
  if (maxScroll <= 0) return;
  const progress = Math.min(window.scrollY / maxScroll, 1);
  progressBar.style.transform = `scaleX(${progress})`;
}

function initProgressBar() {
  updateProgressBar();
}


/* ─────────────────────────────────────────────────────────────
   7. TIMELINE NAV (desktop + mobile)
   Uses pre-computed absolute scroll positions so it works
   correctly with the story-block architecture.
───────────────────────────────────────────────────────────── */

/**
 * Cache the absolute scroll-top for each section.
 * For sections inside story-blocks, we record the story-block's top.
 * Call this AFTER setStoryBlockHeights() so layout is final.
 */
function computeSectionPositions() {
  sections.forEach(({ el }) => {
    const block = el.closest('.story-block') || el;
    sectionScrollTops.set(el.id, getAbsoluteTop(block));
  });
}

function updateActiveNav() {
  if (!sections.length) return;
  const trigger = window.scrollY + window.innerHeight * 0.4;
  let activeId  = sections[0].el.id;

  sections.forEach(({ el }) => {
    const top = sectionScrollTops.get(el.id) ?? 0;
    if (top <= trigger) activeId = el.id;
  });

  document.querySelectorAll('.nav-item, .mob-nav-item').forEach(item => {
    const top = sectionScrollTops.get(item.dataset.target) ?? 0;
    const strength = clamp(1 - Math.abs((top - trigger) / window.innerHeight));
    const isActive = item.dataset.target === activeId;
    item.classList.toggle('active', isActive);
    item.setAttribute('aria-current', isActive ? 'true' : 'false');
    item.style.setProperty('--nav-strength', strength.toFixed(3));
  });
}

function scrollToSection(targetId) {
  const top = sectionScrollTops.get(targetId);
  if (top != null) {
    window.scrollTo({ top, behavior: 'smooth' });
  } else {
    const el = document.getElementById(targetId);
    if (el) {
      const block = el.closest('.story-block') || el;
      window.scrollTo({ top: getAbsoluteTop(block), behavior: 'smooth' });
    }
  }
}

/* Sections added in the editor get their nav button after this has
   already run, so site-content.js needs to reach the same jump logic. */
window.scrollToSection = scrollToSection;

function initTimelineNav() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => scrollToSection(item.dataset.target));
  });

  updateActiveNav();
}

/** Hero call-to-action buttons — same jump behaviour as the side nav. */
function initJumpButtons() {
  document.querySelectorAll('.hero-btn[data-target]').forEach(btn => {
    btn.addEventListener('click', () => scrollToSection(btn.dataset.target));
  });

  /* The skip link is a real anchor so it works before JS runs; once JS is
     up, route it through scrollToSection so it lands on the story-block
     top rather than the sticky panel's own offset. */
  const skip = document.querySelector('.skip-link');
  if (skip) {
    skip.addEventListener('click', (e) => {
      e.preventDefault();
      scrollToSection(skip.getAttribute('href').slice(1));
    });
  }
}

/**
 * Show the CV button only when CV_URL actually points at a file.
 *
 * This is the offline fallback only. site-content.js owns the button
 * whenever the database is reachable, and stamps data-managed on it —
 * without that check this would run afterwards and wipe the stored
 * value back to the empty constant below. It also hides rather than
 * removes, because a removed element cannot be filled in later.
 */
function initCvLink() {
  const link = document.getElementById('heroCvBtn');
  if (!link || link.dataset.managed === 'true') return;

  if (!CV_URL) { link.hidden = true; return; }
  link.href = CV_URL;
  link.setAttribute('download', '');
  link.hidden = false;
}


/* ─────────────────────────────────────────────────────────────
   8. MOBILE MENU
───────────────────────────────────────────────────────────── */
function initMobileMenu() {
  const btn    = document.getElementById('mob-menu-btn');
  const nav    = document.getElementById('mob-nav');
  if (!btn || !nav) return;

  /* aria-hidden has to track the open state. The markup ships it as
     "true" for the closed state and nothing used to clear it, so the
     menu stayed hidden from assistive tech even while it was on screen
     — and an aria-hidden container full of focusable buttons is invalid
     ARIA besides. The CSS visibility rule handles the tab order; this
     keeps the accessibility tree honest. */
  function openMenu() {
    nav.classList.add('open');
    nav.setAttribute('aria-hidden', 'false');
    btn.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
    /* Move focus into the overlay so a keyboard user lands on the menu
       they just opened rather than staying behind it. */
    nav.querySelector('.mob-nav-item')?.focus();
  }

  function closeMenu({ restoreFocus = true } = {}) {
    nav.classList.remove('open');
    nav.setAttribute('aria-hidden', 'true');
    btn.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
    /* Focus would otherwise be stranded on a button that just became
       invisible, which drops the keyboard user back to the top of the
       document on their next Tab. */
    if (restoreFocus && nav.contains(document.activeElement)) btn.focus();
  }

  btn.addEventListener('click', () => {
    nav.classList.contains('open') ? closeMenu() : openMenu();
  });

  // Close on overlay background click
  nav.addEventListener('click', (e) => {
    if (e.target === nav) closeMenu();
  });

  // Nav items: close menu then scroll
  nav.querySelectorAll('.mob-nav-item').forEach(item => {
    item.addEventListener('click', () => {
      const targetId = item.dataset.target;
      closeMenu({ restoreFocus: false });
      setTimeout(() => scrollToSection(targetId), 300);
    });
  });

  // Close on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && nav.classList.contains('open')) closeMenu();
  });
}


/* ─────────────────────────────────────────────────────────────
   11. SUPABASE — LOAD PROJECTS
───────────────────────────────────────────────────────────── */

/* ── THE ONLY PLACE YOU EDIT URLS ──────────────────────────────
   Paste the public Supabase Storage URL for each file here. These
   keep the buttons alive when the Supabase query fails (free-tier
   projects pause after ~7 days idle), because Storage is served
   over the CDN and stays up even when the database is asleep.
   Use the same URLs in the `update` statements in supabase.sql. */
const PDF = {
  aiFluency:              'https://gnfqwqiegsdralfxzymn.supabase.co/storage/v1/object/public/Assets/certificates/anthropic-ai-fluency.pdf',
  designSprint:           'https://gnfqwqiegsdralfxzymn.supabase.co/storage/v1/object/public/Assets/certificates/design-sprint.pdf',
  microInternship:        'https://gnfqwqiegsdralfxzymn.supabase.co/storage/v1/object/public/Assets/certificates/kbs-micro-internship.pdf',
  ticketspherePrototype:  'https://ticketsphere.figma.site'
};

/* Static fallback content, shown when Supabase is unreachable
   (e.g. the free-tier project is paused). Keep in sync with
   the seed data in supabase.sql. */
const FALLBACK_PROJECTS = [
  {
    title: 'TicketSphere',
    description: 'A digital ticketing platform designed and built during an intensive one-week design sprint at King’s Business School. Taken from concept to a live website and app prototype in five days. Awarded 2nd place for best website and app by students and industry panellists.',
    project_url: 'https://v0-ticketsphere.vercel.app',
    prototype_url: PDF.ticketspherePrototype,
    certificate_url: ''
  },
  {
    title: 'KBS Micro Internship: Jobago AI',
    description: 'Student consultant on a 3-week industry project through King’s Business School. Researched megatrends relevant to Jobago AI, an AI-powered hiring and job-matching platform, and delivered strategic recommendations to the client.',
    project_url: '',
    prototype_url: '',
    certificate_url: PDF.microInternship
  }
];

/* Shown when the Supabase query fails. */
const FALLBACK_CERTS = [
  { title: 'AI Fluency: Foundation & Framework',       issuer: 'Anthropic',              pdf_url: PDF.aiFluency },
  { title: 'Design Sprint',                            issuer: 'King’s College London',  pdf_url: PDF.designSprint },
  { title: 'King’s Business School Micro Internship',  issuer: 'King’s College London',  pdf_url: PDF.microInternship }
];

/* Every URL column the card builders read. These button URLs have silently
   vanished twice because app.js was updated to read a column that supabase.sql
   never created, so the lookup returned undefined and the button was skipped
   with no error. This logs the mismatch instead of rendering a blank card. */
const EXPECTED_COLUMNS = {
  projects:     ['project_url', 'prototype_url', 'certificate_url'],
  certificates: ['pdf_url', 'link']
};

function checkColumns(table, rows) {
  if (!rows || !rows.length) return;
  const present = Object.keys(rows[0]);
  const missing = EXPECTED_COLUMNS[table].filter(col => !present.includes(col));
  if (missing.length) {
    console.warn(
      `Schema drift: the "${table}" table is missing ${missing.join(', ')}. ` +
      `Run the "alter table" lines in supabase.sql — buttons using these will not render.`
    );
  }
}

async function loadProjects() {
  const container = document.getElementById('projectsContainer');
  if (!container) return;

  try {
    const { data, error } = await db
      .from('projects')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    if (!data || data.length === 0) {
      container.innerHTML = '<p class="loading-text">No projects yet. Check back soon.</p>';
      prepareCardMotion(container);
      return;
    }
    checkColumns('projects', data);
    container.innerHTML = data.map(buildProjectCard).join('');
    prepareCardMotion(container);
    updateParallax();
    window.railRemeasure?.();
  } catch (err) {
    console.warn('Projects: Supabase unreachable, showing fallback content.', err);
    container.innerHTML = FALLBACK_PROJECTS.map(buildProjectCard).join('');
    prepareCardMotion(container);
    updateParallax();
    window.railRemeasure?.();
  }
}

function buildProjectCard(p) {
  const rawTitle     = p.title || 'Untitled Project';
  const title        = escapeHtml(rawTitle);
  const desc         = escapeHtml(p.description   || '');
  const websiteUrl   = escapeHtml(p.project_url   || '');
  const prototypeUrl = escapeHtml(p.prototype_url || '');
  const badgeUrl     = escapeHtml(p.badge_url     || '');
  /* Some projects deliver a certificate rather than a live build. */
  const rawCertPdf   = p.certificate_url || '';

  let tagsHtml = '';
  if (p.tags) {
    const list = Array.isArray(p.tags)
      ? p.tags
      : String(p.tags).split(',').map(t => t.trim()).filter(Boolean);
    tagsHtml = list.length
      ? `<div class="card-tags">${list.map(t => `<span class="card-tag">${escapeHtml(t)}</span>`).join('')}</div>`
      : '';
  }

  /* Build action buttons — only render buttons that have a URL */
  const actions = [];

  if (websiteUrl) {
    actions.push(`<a href="${websiteUrl}" class="action-btn action-btn--primary"
        target="_blank" rel="noopener noreferrer" aria-label="Visit ${title} website">
      <svg class="btn-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M7 4H4a1 1 0 00-1 1v7a1 1 0 001 1h7a1 1 0 001-1V9M9 3h4m0 0v4M13 3L8 8"
          stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
      Visit Website
    </a>`);
  }

  if (prototypeUrl) {
    actions.push(`<a href="${prototypeUrl}" class="action-btn action-btn--ghost"
        target="_blank" rel="noopener noreferrer" aria-label="View ${title} prototype">
      <svg class="btn-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M2 8c0-3.3 2.7-6 6-6s6 2.7 6 6-2.7 6-6 6-6-2.7-6-6z"
          stroke="currentColor" stroke-width="1.4"/>
        <circle cx="8" cy="8" r="1.8" stroke="currentColor" stroke-width="1.4"/>
      </svg>
      View Prototype
    </a>`);
  }

  if (badgeUrl) {
    actions.push(`<a href="${badgeUrl}" class="action-btn action-btn--ghost"
        target="_blank" rel="noopener noreferrer" aria-label="View ${title} badge">
      <svg class="btn-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M8 2l1.5 3.4 3.8.5-2.7 2.6.6 3.8L8 10.8l-3.2 1.5.6-3.8L2.7 6l3.8-.5L8 2z"
          stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
      </svg>
      View Badge
    </a>`);
  }

  /* Certificate buttons are primary only when there is no website to lead with. */
  if (rawCertPdf) {
    actions.push(...certActions(rawCertPdf, '', rawTitle, websiteUrl ? 'ghost' : 'primary'));
  }

  const actionsHtml = actions.length
    ? `<div class="card-actions">${actions.join('')}</div>`
    : '';

  /* data-row-id lets the site editor map a click on this card back to
     its database row. Absent for fallback cards, which have no row. */
  const rowId = p.id ? ` data-row-id="${escapeHtml(p.id)}" data-row-table="projects"` : '';

  return `
    <article class="tl-card"${rowId}>
      <h3 class="card-title">${title}</h3>
      ${desc       ? `<p class="card-desc">${desc}</p>` : ''}
      ${tagsHtml}
      ${actionsHtml}
    </article>`;
}


/* ─────────────────────────────────────────────────────────────
   12. SUPABASE — LOAD CERTIFICATES
───────────────────────────────────────────────────────────── */
async function loadCertificates() {
  const container = document.getElementById('certsContainer');
  if (!container) return;

  try {
    const { data, error } = await db
      .from('certificates')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    if (!data || data.length === 0) {
      container.innerHTML = '<p class="loading-text">No certificates yet. Check back soon.</p>';
      prepareCardMotion(container);
      return;
    }
    checkColumns('certificates', data);
    container.innerHTML = data.map(buildCertCard).join('');
    prepareCardMotion(container);
    updateParallax();
    window.railRemeasure?.();
  } catch (err) {
    console.warn('Certificates: Supabase unreachable, showing fallback content.', err);
    container.innerHTML = FALLBACK_CERTS.map(buildCertCard).join('');
    prepareCardMotion(container);
    updateParallax();
    window.railRemeasure?.();
  }
}

/* Certificate button. Shared by the Certificates section and by project
   cards whose deliverable is a certificate, so the two can never drift
   apart. `fallbackUrl` is an issuer verification page, used when there is
   no PDF to serve. One button only: the browser's own PDF viewer already
   offers a download, so a second button would be redundant. */
function certActions(rawPdf, fallbackUrl, rawTitle, variant) {
  const title   = escapeHtml(rawTitle);
  const viewUrl = escapeHtml(rawPdf || fallbackUrl || '');
  const out     = [];

  if (viewUrl) {
    out.push(`<a href="${viewUrl}" class="action-btn action-btn--${variant}"
        target="_blank" rel="noopener noreferrer" aria-label="View ${title} certificate">
      <svg class="btn-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <rect x="2" y="2" width="12" height="9" rx="1" stroke="currentColor" stroke-width="1.4"/>
        <path d="M5 14l3-1.8 3 1.8v-3H5v3z"
          stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
      </svg>
      View Certificate
    </a>`);
  }

  return out;
}

function buildCertCard(c) {
  const rawTitle = c.title    || c.name || 'Certificate';
  const rawPdf   = c.pdf_url  || c.file_url || '';
  const rawCert  = c.cert_url || c.url  || c.link || '';

  const title    = escapeHtml(rawTitle);
  const issuer   = escapeHtml(c.issuer    || c.org   || '');
  const badgeUrl = escapeHtml(c.badge_url || c.badge || '');

  /* Deliberately NOT falling back to created_at: that is when the row was
     added to Supabase, not when the certificate was earned, so showing it
     puts a wrong date on the card. Only a real issue date is displayed. */
  let dateHtml = '';
  const rawDate = c.issued_at || c.date;
  if (rawDate) {
    try {
      const d = new Date(rawDate);
      dateHtml = `<span class="card-date">${d.toLocaleDateString('en-GB', { month: 'short', year: 'numeric' })}</span>`;
    } catch (_) { /* ignore */ }
  }

  const badgeHtml = badgeUrl
    ? `<img class="card-badge" src="${badgeUrl}" alt="${title} badge" loading="lazy" />`
    : '';

  /* Build action buttons — only render buttons that have a URL */
  const actions = certActions(rawPdf, rawCert, rawTitle, 'primary');

  const actionsHtml = actions.length
    ? `<div class="card-actions">${actions.join('')}</div>`
    : '';

  const rowId = c.id ? ` data-row-id="${escapeHtml(c.id)}" data-row-table="certificates"` : '';

  return `
    <article class="tl-card"${rowId}>
      ${badgeHtml}
      <h3 class="card-title">${title}</h3>
      ${issuer      ? `<p class="card-issuer">${issuer}</p>` : ''}
      ${dateHtml}
      ${actionsHtml}
    </article>`;
}


/* ─────────────────────────────────────────────────────────────
   15. CONTACT FORM (Supabase)
───────────────────────────────────────────────────────────── */
function initContactForm() {
  const form      = document.getElementById('contactForm');
  const statusEl  = document.getElementById('contactStatus');
  const submitBtn = form?.querySelector('.contact-submit-btn');
  const btnText   = submitBtn?.querySelector('.btn-text');
  const btnLoad   = submitBtn?.querySelector('.btn-loading');

  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const name    = form.querySelector('#cf-name').value.trim();
    const email   = form.querySelector('#cf-email').value.trim().toLowerCase();
    const phone   = form.querySelector('#cf-phone').value.trim() || null;
    const reason  = form.querySelector('#cf-reason').value || null;
    const message = form.querySelector('#cf-message').value.trim();

    if (!name)                        { showStatus('Please enter your name.',           'error'); return; }
    if (!email || !email.includes('@')) { showStatus('Please enter a valid email.',      'error'); return; }
    if (!message)                     { showStatus('Please enter a message.',           'error'); return; }

    setLoading(true);
    showStatus('', '');

    try {
      const { error } = await db
        .from('contact_submissions')
        .insert([{ name, email, phone, reason, message }]);

      if (error) throw error;

      showStatus("Message sent! I'll be in touch soon 🙌", 'success');
      form.reset();
    } catch (err) {
      console.error('Contact form error:', err);
      showStatus('Something went wrong. Please email me directly at kabirmehta3112@gmail.com', 'error');
    } finally {
      setLoading(false);
    }
  });

  function setLoading(on) {
    if (!submitBtn) return;
    submitBtn.disabled = on;
    if (btnText) btnText.hidden =  on;
    if (btnLoad) btnLoad.hidden = !on;
  }

  function showStatus(text, type) {
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.className   = 'contact-status' + (type ? ` ${type}` : '');
  }
}


/* ─────────────────────────────────────────────────────────────
   16. NEWSLETTER FORM
───────────────────────────────────────────────────────────── */
function initNewsletterForm() {
  const form      = document.getElementById('newsletterForm');
  const input     = document.getElementById('newsletterEmail');
  const msgEl     = document.getElementById('newsletterMessage');
  const submitBtn = form?.querySelector('.newsletter-submit');
  const btnText   = submitBtn?.querySelector('.btn-text');
  const btnLoad   = submitBtn?.querySelector('.btn-loading');

  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = (input.value || '').trim().toLowerCase();

    if (!email || !email.includes('@')) {
      showMessage('Please enter a valid email address.', 'error');
      input.focus();
      return;
    }

    setLoading(true);
    showMessage('', '');

    /* No lookup before inserting: RLS deliberately grants insert-only on
       this table, so a SELECT would always come back empty and let the
       subscriber list stay private. The unique constraint on `email` is
       what detects a repeat signup — Postgres reports it as 23505. */
    try {
      const { error: insertErr } = await db
        .from('newsletter_subscribers')
        .insert([{ email }]);

      if (insertErr) {
        if (insertErr.code === '23505') {
          showMessage("You're already subscribed. Thanks for the enthusiasm 🙌", 'info');
          form.reset();
          return;
        }
        throw insertErr;
      }

      showMessage("You're in! I'll email you the moment the first issue drops. 🚀", 'success');
      form.reset();
    } catch (err) {
      console.error('Newsletter error:', err);
      showMessage('Something went wrong. Please try again.', 'error');
    } finally {
      setLoading(false);
    }
  });

  function setLoading(on) {
    if (!submitBtn) return;
    submitBtn.disabled = on;
    if (btnText) btnText.hidden =  on;
    if (btnLoad) btnLoad.hidden = !on;
  }

  function showMessage(text, type) {
    if (!msgEl) return;
    msgEl.textContent = text;
    msgEl.className   = 'newsletter-message' + (type ? ` ${type}` : '');
  }
}


/* ─────────────────────────────────────────────────────────────
   17. BOOT
───────────────────────────────────────────────────────────── */
function boot() {
  // Collect all panels
  sections = Array.from(document.querySelectorAll('.panel')).map(el => ({
    el,
    inner: el.querySelector('.panel-inner, .panel-text'),
  }));

  const copyrightYear = document.getElementById('copyrightYear');
  if (copyrightYear) copyrightYear.textContent = new Date().getFullYear();

  // ── Architecture ──────────────────────────────────────────
  // 1. Set story-block heights (must be before position caching)
  // 2. Cache absolute scroll positions for each section
  // 3. Wire up scroll-driven image animation
  initScrollStory();          // sets heights + initial transforms
  computeSectionPositions();  // cache absolute tops (after heights set)
  updateParallax();           // set initial --p-y values

  // ── Reveal animations ─────────────────────────────────────
  initReveal();

  // ── UI ────────────────────────────────────────────────────
  initProgressBar();
  initTimelineNav();
  initJumpButtons();
  initCvLink();
  initMobileMenu();

  // ── Data ──────────────────────────────────────────────────
  loadProjects();
  loadCertificates();
  initNewsletterForm();
  initContactForm();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}

// Re-cache positions after all fonts/images have loaded.
// Google Fonts (Cormorant Garamond) can reflow text and shift section
// positions after DOMContentLoaded, causing nav clicks to land wrong.
window.addEventListener('load', () => {
  computeSectionPositions();
  updateParallax();
  updateActiveNav();
});

/* Content from Supabase changes how tall every panel is and can reorder
   or hide sections outright, so everything measured at boot has to be
   measured again. Fired once by site-content.js. */
window.addEventListener('site-content-ready', () => {
  sections = Array.from(document.querySelectorAll('.panel')).map(el => ({
    el,
    inner: el.querySelector('.panel-inner, .panel-text'),
  }));
  prepareTextReveals();
  setStoryBlockHeights();
  computeSectionPositions();
  updateParallax();
  updateActiveNav();
});
