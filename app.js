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
   13. Newsletter form
   14. Boot
   ============================================================ */


/* ─────────────────────────────────────────────────────────────
   1. CONFIG — SUPABASE
   Values are injected by config.js (loaded before this script).
   See config.example.js for the template.
───────────────────────────────────────────────────────────── */
const SUPABASE_URL      = window.SUPABASE_URL;
const SUPABASE_ANON_KEY = window.SUPABASE_ANON_KEY;

const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);


/* ─────────────────────────────────────────────────────────────
   2. STATE & HELPERS
───────────────────────────────────────────────────────────── */
let sections          = [];  // { el, inner } for all .panel elements
let sectionScrollTops = new Map(); // cached absolute scroll positions
let scrollRAF         = null;

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
    const extra = parseFloat(block.dataset.extraVh) || 150;
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
  sections.forEach(({ el }) => {
    const inner = el.querySelector('.panel-inner');
    if (!inner || !inner.classList.contains('in-view')) return;

    const block    = el.closest('.story-block') || el;
    const blockTop = sectionScrollTops.get(el.id) ?? 0;
    const blockH   = block.offsetHeight;
    if (!blockH) return;

    const scrolled  = window.scrollY - blockTop;
    const progress  = Math.max(0, Math.min(scrolled / blockH, 1));
    const dist      = block.classList.contains('story-block') ? 80 : 30;
    const y         = Math.round(-progress * dist);

    inner.style.setProperty('--p-y', `${y}px`);
  });
}


/* ─────────────────────────────────────────────────────────────
   4. SECTION REVEAL — IntersectionObserver
   .panel-inner and .panel-text.panel-inner fade up on entry.
───────────────────────────────────────────────────────────── */
function initReveal() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in-view');
        observer.unobserve(entry.target);
      }
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
  const about = document.getElementById('intro-about');
  if (!about) return;

  const obs = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) {
      runAboutAnimation();
      obs.disconnect();
    }
  }, { threshold: 0.2 });

  obs.observe(about);
}

function runAboutAnimation() {
  const line1     = document.getElementById('nameLine1');
  const line2     = document.getElementById('nameLine2');
  const underln   = document.getElementById('underline-path');
  const photo     = document.getElementById('introProfile');
  const subtitle  = document.getElementById('introSubtitle');
  const para      = document.getElementById('introAboutPara');
  const loading   = document.getElementById('aboutLoading');
  const barFill   = document.getElementById('loadingBarFill');
  const countdown = document.getElementById('loadingCountdown');

  if (line1)    setTimeout(() => line1.classList.add('visible'),    150);
  if (line2)    setTimeout(() => line2.classList.add('visible'),    320);
  if (underln)  setTimeout(() => underln.classList.add('drawn'),    700);
  if (photo)    setTimeout(() => photo.classList.add('visible'),    500);
  if (subtitle) setTimeout(() => subtitle.classList.add('visible'), 1100);
  if (para)     setTimeout(() => para.classList.add('visible'),     1350);

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
    item.classList.toggle('active', item.dataset.target === activeId);
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
      container.innerHTML = '<p class="loading-text">No projects yet — check back soon.</p>';
      return;
    }
    container.innerHTML = data.map(buildProjectCard).join('');
  } catch (err) {
    console.error('Failed to load projects:', err);
    container.innerHTML = '<p class="error-text">Could not load projects. Please refresh.</p>';
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
      container.innerHTML = '<p class="loading-text">No certificates yet — check back soon.</p>';
      return;
    }
    container.innerHTML = data.map(buildCertCard).join('');
  } catch (err) {
    console.error('Failed to load certificates:', err);
    container.innerHTML = '<p class="error-text">Could not load certificates. Please refresh.</p>';
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
   14. CONTACT FORM (Supabase)
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
      showStatus('Something went wrong — please email me directly at kabirmehta3112@gmail.com', 'error');
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
   15. NEWSLETTER FORM
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
        showMessage("You're already subscribed — thanks for the enthusiasm 🙌", 'info');
        setLoading(false);
        return;
      }

      const { error: insertErr } = await db
        .from('newsletter_subscribers')
        .insert([{ email }]);

      if (insertErr) throw insertErr;

      showMessage("You're in! First issue drops April 15. 🚀", 'success');
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
   14. BOOT
───────────────────────────────────────────────────────────── */
function boot() {
  // Collect all panels
  sections = Array.from(document.querySelectorAll('.panel')).map(el => ({
    el,
    inner: el.querySelector('.panel-inner, .panel-text'),
  }));

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
