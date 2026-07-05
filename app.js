/* ============================================================
   KABIR MEHTA — PORTFOLIO  |  app.js
   ============================================================
   Table of contents:
   1.  Config — Supabase
   2.  State & helpers
   3.  Story-block scroll architecture (image bottom-to-top)
   4.  Section reveal (IntersectionObserver)
   5.  Intro animations
   6.  Progress bar
   7.  Timeline nav (desktop + mobile)
   8.  Mobile menu
   9.  Expand / collapse buttons
   10. FinIQ context overlay
   11. Supabase — load projects
   12. Supabase — load certificates
   13. Auto-scroll guard
   14. Sidebar visibility (auto-hide on idle)
   15. Contact form (Supabase)
   16. Newsletter form
   17. Boot
   ============================================================ */


/* ─────────────────────────────────────────────────────────────
   1. CONFIG — SUPABASE
   Values are injected by config.js (loaded before this script).
   See config.example.js for the template.
───────────────────────────────────────────────────────────── */
const SUPABASE_URL      = window.SUPABASE_URL;
const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY;

/* Null when config.js or the supabase-js CDN script failed to load —
   loaders below fall back to static content instead of crashing. */
const db = (window.supabase && SUPABASE_URL && SUPABASE_ANON_KEY)
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;


/* ─────────────────────────────────────────────────────────────
   2. STATE & HELPERS
───────────────────────────────────────────────────────────── */
let sections          = [];  // { el, inner } for all .panel elements
let sectionScrollTops = new Map(); // cached absolute scroll positions
let scrollRAF         = null;
let aboutSequenceStarted = false;

const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

const SECTION_MOTION = {
  'intro-avatar':       { hero: true, depth: 10 },
  'intro-about':        { hero: true, depth: 10 },
  'childhood':          { extraVh: 26, depth: 10, textLead: 0.02 },
  'early-spark':        { extraVh: 26, depth: 10, textLead: 0.03 },
  'christ':             { extraVh: 26, depth: 10, textLead: 0.03 },
  'finiq':              { extraVh: 88, depth: 16, textLead: 0.00 },
  'why-msc':            { extraVh: 78, depth: 14, textLead: 0.01 },
  'kings':              { extraVh: 34, depth: 10, textLead: 0.03 },
  'dissertation':       { extraVh: 40, depth: 10, textLead: 0.03 },
  'ai-interest':        { extraVh: 38, depth: 10, textLead: 0.02 },
  'personal':           { extraVh: 24, depth: 8, textLead: 0.04 },
  'projects':           { extraVh: 235, depth: 16, textLead: 0.00, cards: true },
  'certificates':       { extraVh: 220, depth: 14, textLead: 0.00, cards: true },
  'newsletter-section': { extraVh: 235, depth: 14, textLead: 0.00 },
  'contact':            { extraVh: 62, depth: 8, textLead: 0.02 },
};

// Auto-scroll state — set to true the moment user touches scroll input
let autoScrollCancelled  = false;
let _asBarTimer          = null;  // setTimeout: show loading bar
let _asScrollTimer       = null;  // setTimeout: execute scroll to FinIQ
let _asTick              = null;  // setInterval: countdown ticker

/** Permanently cancel the FinIQ auto-scroll and tear down its UI. */
function cancelAutoScroll() {
  if (autoScrollCancelled) return;
  autoScrollCancelled = true;
  clearTimeout(_asBarTimer);
  clearTimeout(_asScrollTimer);
  clearInterval(_asTick);
  const loading = document.getElementById('aboutLoading');
  if (loading) loading.classList.remove('active');
}

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

/** Set inline heights on all story-blocks based on data-extra-vh */
function setStoryBlockHeights() {
  document.querySelectorAll('.story-block').forEach(block => {
    const panel = block.querySelector('.panel');
    const motion = panel ? getSectionMotion(panel.id) : {};
    const declared = block.dataset.extraVh !== undefined && block.dataset.extraVh !== ''
      ? parseFloat(block.dataset.extraVh)
      : NaN;
    const extra = Number.isFinite(declared)
      ? Math.max(declared, motion.extraVh ?? declared)
      : (motion.extraVh ?? 150);
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
  if (prefersReducedMotion.matches) {
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

function updateHeroSequence(forceComplete = false) {
  const avatarPanel = document.getElementById('intro-avatar');
  const avatar = document.getElementById('introAvatar');
  const avatarPanelInner = document.getElementById('avatarPanelInner');
  const about = document.getElementById('intro-about');
  const aboutContent = document.getElementById('aboutPanelInner');
  const indicator = avatarPanel?.querySelector('.scroll-indicator');
  const line1 = document.getElementById('nameLine1');
  const line2 = document.getElementById('nameLine2');
  const subtitle = document.getElementById('introSubtitle');
  const aboutPara = document.getElementById('introAboutPara');
  const underline = document.getElementById('underline-path');

  if (!avatarPanel || !about) return;

  const viewportH = window.innerHeight;
  const aboutTop = sectionScrollTops.get('intro-about') ?? getAbsoluteTop(about);
  const heroSpan = Math.max(viewportH * 0.95, aboutTop);
  const heroProgress = forceComplete ? 1 : clamp(window.scrollY / Math.max(heroSpan, 1));
  const dockProgress = easeInOutSine(clamp((heroProgress - 0.06) / 0.52));
  const aboutProgress = easeOutCubic(clamp((heroProgress - 0.16) / 0.42));

  avatarPanelInner?.style.setProperty('--hero-avatar-y', '0px');
  avatarPanelInner?.style.setProperty('--hero-avatar-scale', '1');
  avatarPanelInner?.style.setProperty('--hero-avatar-opacity', clamp(1 - dockProgress * 1.1).toFixed(3));
  avatarPanelInner?.style.setProperty('--hero-quip-opacity', clamp(1 - dockProgress * 1.4).toFixed(3));
  avatar?.style.setProperty('--avatar-screen-x', '0px');
  avatar?.style.setProperty('--avatar-screen-y', `${lerp(0, -24, dockProgress).toFixed(2)}px`);
  avatar?.style.setProperty('--avatar-screen-scale', lerp(1, 0.88, dockProgress).toFixed(3));
  avatar?.style.setProperty('--hero-avatar-tilt', `${lerp(0, -8, dockProgress).toFixed(2)}deg`);
  indicator?.style.setProperty('--hero-indicator-opacity', clamp(1 - dockProgress * 1.6).toFixed(3));

  aboutContent?.style.setProperty('--about-shift-y', `${lerp(52, 0, aboutProgress).toFixed(2)}px`);
  aboutContent?.style.setProperty('--about-opacity', clamp(0.1 + aboutProgress * 0.9).toFixed(3));

  line1?.classList.toggle('visible', aboutProgress > 0.08);
  line2?.classList.toggle('visible', aboutProgress > 0.18);
  subtitle?.classList.toggle('visible', aboutProgress > 0.44);
  aboutPara?.classList.toggle('visible', aboutProgress > 0.56);

  updateRevealElement(line1, clamp((aboutProgress - 0.02) * 1.28));
  updateRevealElement(line2, clamp((aboutProgress - 0.14) * 1.28));

  if (underline) {
    underline.style.strokeDashoffset = String(1 - clamp((aboutProgress - 0.22) * 1.4));
    underline.classList.toggle('drawn', aboutProgress > 0.84);
  }

  if (!aboutSequenceStarted && (forceComplete || aboutProgress > 0.72)) {
    runAboutAnimation();
    aboutSequenceStarted = true;
  }
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
    if (panel && (panel.id === 'intro-avatar' || panel.id === 'intro-about')) return;
    observer.observe(el);
  });
}


/* ─────────────────────────────────────────────────────────────
   5. INTRO ANIMATIONS
───────────────────────────────────────────────────────────── */

/** S1: avatar spins in on load */
function runAvatarAnimation() {
  const avatar = document.getElementById('introAvatar');
  if (avatar) setTimeout(() => avatar.classList.add('visible'), 200);
}

/** S2: watch for intro-about entering viewport */
function initAboutAnimation() {
  updateHeroSequence();
}

function runAboutAnimation() {
  if (runAboutAnimation.started) return;
  runAboutAnimation.started = true;

  const line1     = document.getElementById('nameLine1');
  const line2     = document.getElementById('nameLine2');
  const underln   = document.getElementById('underline-path');
  const subtitle  = document.getElementById('introSubtitle');
  const para      = document.getElementById('introAboutPara');
  const loading   = document.getElementById('aboutLoading');
  const barFill   = document.getElementById('loadingBarFill');
  const countdown = document.getElementById('loadingCountdown');

  if (line1) line1.classList.add('visible');
  if (line2) line2.classList.add('visible');
  if (underln) setTimeout(() => underln.classList.add('drawn'), 220);
  if (subtitle) subtitle.classList.add('visible');
  if (para) para.classList.add('visible');

  // Loading bar → auto-scroll to FinIQ
  _asBarTimer = setTimeout(() => {
    if (autoScrollCancelled) return;

    if (loading) loading.classList.add('active');

    if (barFill) {
      requestAnimationFrame(() => requestAnimationFrame(() => {
        barFill.classList.add('running');
      }));
    }

    let secsLeft = 10;
    _asTick = setInterval(() => {
      if (autoScrollCancelled) { clearInterval(_asTick); return; }
      secsLeft--;
      if (countdown) {
        countdown.textContent = secsLeft > 0
          ? `Auto-scrolling in ${secsLeft}s`
          : 'Scrolling now…';
      }
      if (secsLeft <= 0) clearInterval(_asTick);
    }, 1000);

    // Scroll to FinIQ using the cached absolute position
    _asScrollTimer = setTimeout(() => {
      if (autoScrollCancelled) return;

      const finiqTop = sectionScrollTops.get('finiq');
      if (finiqTop != null) {
        window.scrollTo({ top: finiqTop, behavior: 'smooth' });
      } else {
        // Fallback: find block containing finiq
        const finiqEl = document.getElementById('finiq');
        if (finiqEl) {
          const block = finiqEl.closest('.story-block') || finiqEl;
          window.scrollTo({ top: getAbsoluteTop(block), behavior: 'smooth' });
        }
      }

      // Show one-time context overlay after scroll settles
      setTimeout(() => {
        if (typeof window.__showFiniqOverlay === 'function') {
          window.__showFiniqOverlay();
        }
      }, 900);
    }, 10000);

  }, 1700);
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

function initTimelineNav() {
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => scrollToSection(item.dataset.target));
  });

  updateActiveNav();
}


/* ─────────────────────────────────────────────────────────────
   8. MOBILE MENU
───────────────────────────────────────────────────────────── */
function initMobileMenu() {
  const btn    = document.getElementById('mob-menu-btn');
  const nav    = document.getElementById('mob-nav');
  if (!btn || !nav) return;

  function openMenu() {
    nav.classList.add('open');
    btn.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
  }

  function closeMenu() {
    nav.classList.remove('open');
    btn.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
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
      closeMenu();
      setTimeout(() => scrollToSection(targetId), 300);
    });
  });

  // Close on Escape
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && nav.classList.contains('open')) closeMenu();
  });
}


/* ─────────────────────────────────────────────────────────────
   9. EXPAND / COLLAPSE BUTTONS
───────────────────────────────────────────────────────────── */
function initExpandButtons() {
  document.querySelectorAll('.expand-btn').forEach(btn => {
    const expandable = document.getElementById(btn.dataset.target);
    if (!expandable) return;

    btn.addEventListener('click', () => {
      const isOpen = expandable.classList.contains('open');
      if (isOpen) {
        expandable.style.maxHeight = '0';
        expandable.classList.remove('open');
        btn.setAttribute('aria-expanded', 'false');
        expandable.setAttribute('aria-hidden', 'true');
      } else {
        expandable.classList.add('open');
        expandable.style.maxHeight = expandable.scrollHeight + 'px';
        btn.setAttribute('aria-expanded', 'true');
        expandable.setAttribute('aria-hidden', 'false');
      }
    });
  });
}


/* ─────────────────────────────────────────────────────────────
   10. FINIQ CONTEXT OVERLAY
   One-time session overlay triggered after auto-scroll to FinIQ.
───────────────────────────────────────────────────────────── */
function initFiniqOverlay() {
  const overlay = document.getElementById('finiq-overlay');
  const dismiss = overlay?.querySelector('.finiq-overlay__dismiss');
  if (!overlay) return;

  function showOverlay() {
    if (sessionStorage.getItem('finiqOverlayShown')) return;
    sessionStorage.setItem('finiqOverlayShown', '1');
    overlay.setAttribute('aria-hidden', 'false');
    setTimeout(() => overlay.classList.add('visible'), 300);
    setTimeout(hideOverlay, 5000);
  }

  function hideOverlay() {
    overlay.classList.add('hiding');
    overlay.classList.remove('visible');
    setTimeout(() => {
      overlay.classList.remove('hiding');
      overlay.setAttribute('aria-hidden', 'true');
    }, 600);
  }

  if (dismiss) dismiss.addEventListener('click', hideOverlay);

  // Dismiss on any scroll once visible
  window.addEventListener('scroll', () => {
    if (overlay.classList.contains('visible')) hideOverlay();
  }, { passive: true });

  window.__showFiniqOverlay = showOverlay;
}


/* ─────────────────────────────────────────────────────────────
   11. SUPABASE — LOAD PROJECTS
───────────────────────────────────────────────────────────── */

/* Static fallback content, shown when Supabase is unreachable
   (e.g. the free-tier project is paused). Keep in sync with
   the seed data in supabase.sql. */
const FALLBACK_PROJECTS = [
  {
    title: 'TicketSphere',
    description: 'A digital ticketing platform designed and built during an intensive one-week design sprint at King’s Business School. Taken from concept to a live website and app prototype in five days. Awarded 2nd place for best website and app by students and industry panellists.',
    project_url: 'https://v0-ticketsphere.vercel.app'
  },
  {
    title: 'KBS Micro Internship: Jobago AI',
    description: 'Student consultant on a 3-week industry project through King’s Business School. Researched megatrends relevant to Jobago AI, an AI-powered hiring and job-matching platform, and delivered strategic recommendations to the client.'
  }
];

const FALLBACK_CERTS = [
  { title: 'AI Fluency: Foundation & Framework', issuer: 'Anthropic' },
  { title: 'Design Sprint', issuer: 'King’s College London' },
  { title: 'King’s Business School Micro Internship', issuer: 'King’s College London' }
];

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
    container.innerHTML = data.map(buildProjectCard).join('');
    prepareCardMotion(container);
    updateParallax();
  } catch (err) {
    console.warn('Projects: Supabase unreachable, showing fallback content.', err);
    container.innerHTML = FALLBACK_PROJECTS.map(buildProjectCard).join('');
    prepareCardMotion(container);
    updateParallax();
  }
}

function buildProjectCard(p) {
  const title        = escapeHtml(p.title         || 'Untitled Project');
  const desc         = escapeHtml(p.description   || '');
  const websiteUrl   = escapeHtml(p.project_url   || '');
  const prototypeUrl = escapeHtml(p.prototype_url || '');
  const badgeUrl     = escapeHtml(p.badge_url     || '');

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

  const actionsHtml = actions.length
    ? `<div class="card-actions">${actions.join('')}</div>`
    : '';

  return `
    <article class="tl-card">
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
    container.innerHTML = data.map(buildCertCard).join('');
    prepareCardMotion(container);
    updateParallax();
  } catch (err) {
    console.warn('Certificates: Supabase unreachable, showing fallback content.', err);
    container.innerHTML = FALLBACK_CERTS.map(buildCertCard).join('');
    prepareCardMotion(container);
    updateParallax();
  }
}

function buildCertCard(c) {
  const title    = escapeHtml(c.title     || c.name  || 'Certificate');
  const issuer   = escapeHtml(c.issuer    || c.org   || '');
  const badgeUrl = escapeHtml(c.badge_url || c.badge || '');
  const certUrl  = escapeHtml(c.cert_url  || c.url   || c.link || '');
  const pdfUrl   = escapeHtml(c.pdf_url   || '');

  let dateHtml = '';
  const rawDate = c.issued_at || c.date || c.created_at;
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
  const actions = [];

  if (certUrl) {
    actions.push(`<a href="${certUrl}" class="action-btn action-btn--primary"
        target="_blank" rel="noopener noreferrer" aria-label="View ${title} certificate">
      <svg class="btn-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <rect x="2" y="2" width="12" height="9" rx="1" stroke="currentColor" stroke-width="1.4"/>
        <path d="M5 14l3-1.8 3 1.8v-3H5v3z"
          stroke="currentColor" stroke-width="1.3" stroke-linejoin="round"/>
      </svg>
      View Certificate
    </a>`);
  }

  if (pdfUrl) {
    actions.push(`<a href="${pdfUrl}" class="action-btn action-btn--ghost"
        target="_blank" rel="noopener noreferrer" aria-label="Open ${title} PDF">
      <svg class="btn-icon" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M9.5 2H4a1 1 0 00-1 1v10a1 1 0 001 1h8a1 1 0 001-1V5.5L9.5 2z"
          stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/>
        <path d="M9.5 2v3.5H13M5.5 9.5h5M5.5 11.5h3.5"
          stroke="currentColor" stroke-width="1.2" stroke-linecap="round"/>
      </svg>
      Open PDF
    </a>`);
  }

  const actionsHtml = actions.length
    ? `<div class="card-actions">${actions.join('')}</div>`
    : '';

  return `
    <article class="tl-card">
      ${badgeHtml}
      <h3 class="card-title">${title}</h3>
      ${issuer      ? `<p class="card-issuer">${issuer}</p>` : ''}
      ${dateHtml}
      ${actionsHtml}
    </article>`;
}


/* ─────────────────────────────────────────────────────────────
   13. AUTO-SCROLL GUARD
   Cancels the FinIQ auto-scroll only when the user has scrolled
   ≥ 50 % into the section immediately after the About panel.
   Minor / accidental scrolls that stay within About are ignored.
───────────────────────────────────────────────────────────── */
function initAutoScrollGuard() {
  function checkScrollDepth() {
    if (autoScrollCancelled) {
      window.removeEventListener('scroll', checkScrollDepth);
      return;
    }

    // Build a scroll-position-sorted list of [id, top] pairs
    const sorted = [...sectionScrollTops.entries()]
      .sort((a, b) => a[1] - b[1]);

    const aboutIdx = sorted.findIndex(([id]) => id === 'intro-about');
    if (aboutIdx === -1 || aboutIdx >= sorted.length - 1) return;

    const [, nextTop]  = sorted[aboutIdx + 1];
    const nextNextEntry = sorted[aboutIdx + 2];
    // Height of the next section = distance to the section after it
    const nextHeight   = nextNextEntry
      ? nextNextEntry[1] - nextTop
      : window.innerHeight;

    // Progress 0→1 through the next section
    const progress = (window.scrollY - nextTop) / nextHeight;

    if (progress >= 0.5) {
      cancelAutoScroll();
      window.removeEventListener('scroll', checkScrollDepth);
    }
  }

  window.addEventListener('scroll', checkScrollDepth, { passive: true });
}

/* ─────────────────────────────────────────────────────────────
   14. SIDEBAR VISIBILITY (auto-hide on idle)
   Desktop only — mobile nav is always visible via overlay.
───────────────────────────────────────────────────────────── */
function initSidebarVisibility() {
  const nav = document.getElementById('side-nav');
  if (!nav) return;

  let idleTimer = null;
  const IDLE_DELAY = 1500; // ms after scroll stops

  function goIdle() { nav.classList.add('nav-idle'); }

  function goActive() {
    nav.classList.remove('nav-idle');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(goIdle, IDLE_DELAY);
  }

  // Start idle — nav is hidden until first scroll
  nav.classList.add('nav-idle');

  window.addEventListener('scroll', goActive, { passive: true });

  // Reveal on hover so users can click without scrolling first
  nav.addEventListener('mouseenter', () => {
    clearTimeout(idleTimer);
    nav.classList.remove('nav-idle');
  });

  nav.addEventListener('mouseleave', () => {
    idleTimer = setTimeout(goIdle, IDLE_DELAY);
  });
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

    try {
      const { data: existing, error: checkErr } = await db
        .from('newsletter_subscribers')
        .select('email')
        .eq('email', email)
        .maybeSingle();

      if (checkErr) throw checkErr;

      if (existing) {
        showMessage("You're already subscribed. Thanks for the enthusiasm 🙌", 'info');
        setLoading(false);
        return;
      }

      const { error: insertErr } = await db
        .from('newsletter_subscribers')
        .insert([{ email }]);

      if (insertErr) throw insertErr;

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

  // ── Intro sequence ────────────────────────────────────────
  runAvatarAnimation();
  initAboutAnimation();

  // ── UI ────────────────────────────────────────────────────
  initProgressBar();
  initTimelineNav();
  initMobileMenu();
  initSidebarVisibility();
  initAutoScrollGuard();
  initExpandButtons();
  initFiniqOverlay();

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
