/* ============================================================
   KABIR MEHTA — PORTFOLIO  |  app.js
   ============================================================
   Table of contents:
   1.  Config — Supabase
   2.  State & helpers
   3.  Section reveal (IntersectionObserver)
   4.  Intro animations
   5.  Progress bar
   6.  Side-nav dots
   7.  Expand / collapse buttons
   8.  Supabase — load projects
   9.  Supabase — load certificates
   10. Newsletter form
   11. Boot
   ============================================================ */


/* ─────────────────────────────────────────────────────────────
   1. CONFIG — SUPABASE
───────────────────────────────────────────────────────────── */
const SUPABASE_URL      = 'https://gnfqwqiegsdralfxzymn.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImduZnF3cWllZ3NkcmFsZnh6eW1uIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUyMTQ1NjksImV4cCI6MjA5MDc5MDU2OX0.vLgmmabfHJfAjk7dWPgsxTiT39bffuhVGNRz6h-5peQ';

// Use `db` — avoids conflict with the CDN's global `supabase` var
const db = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);


/* ─────────────────────────────────────────────────────────────
   2. STATE & HELPERS
───────────────────────────────────────────────────────────── */
let sections = [];   // { el, inner } for all .panel elements

/**
 * Escape HTML to prevent XSS when inserting Supabase data.
 */
function escapeHtml(str) {
  if (str == null) return '';
  return String(str)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#39;');
}


/* ─────────────────────────────────────────────────────────────
   3. SECTION REVEAL — IntersectionObserver
   Each .panel-inner fades up when its panel scrolls into view.
   The intro panels manage their own animations separately.
───────────────────────────────────────────────────────────── */
function initReveal() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in-view');
        observer.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.12,
  });

  document.querySelectorAll('.panel-inner').forEach(inner => {
    const panel = inner.closest('.panel');
    // Skip intro panels — they have custom staggered animations
    if (panel && (panel.id === 'intro-avatar' || panel.id === 'intro-about')) return;
    observer.observe(inner);
  });
}


/* ─────────────────────────────────────────────────────────────
   4. INTRO ANIMATIONS

   Section 1 (#intro-avatar):
     Avatar Y-spins in on page load → idle revolve loops.

   Section 2 (#intro-about):
     Name lines + underline + profile + subtitle animate in
     when the section slides into view (IntersectionObserver).
───────────────────────────────────────────────────────────── */

/** Section 1: avatar spins in immediately on load */
function runAvatarAnimation() {
  const avatar = document.getElementById('introAvatar');
  if (avatar) {
    setTimeout(() => avatar.classList.add('visible'), 200);
  }
}

/** Section 2: watch for #intro-about entering the viewport */
function initAboutAnimation() {
  const aboutSection = document.getElementById('intro-about');
  if (!aboutSection) return;

  const observer = new IntersectionObserver((entries) => {
    if (entries[0].isIntersecting) {
      runAboutAnimation();
      observer.disconnect();
    }
  }, { threshold: 0.25 });

  observer.observe(aboutSection);
}

function runAboutAnimation() {
  const line1    = document.getElementById('nameLine1');
  const line2    = document.getElementById('nameLine2');
  const underln  = document.getElementById('underline-path');
  const profile  = document.getElementById('introProfile');
  const subtitle = document.getElementById('introSubtitle');
  const para     = document.getElementById('introAboutPara');

  // Ensure the panel-inner is immediately visible (it manages its own opacity)
  const inner = document.getElementById('aboutPanelInner');
  if (inner) {
    inner.style.opacity   = '1';
    inner.style.transform = 'none';
  }

  // Staggered entrance
  if (line1)    setTimeout(() => line1.classList.add('visible'),    150);
  if (line2)    setTimeout(() => line2.classList.add('visible'),    320);
  if (underln)  setTimeout(() => underln.classList.add('drawn'),    700);
  if (profile)  setTimeout(() => profile.classList.add('visible'),  950);
  if (subtitle) setTimeout(() => subtitle.classList.add('visible'), 1200);
  if (para)     setTimeout(() => para.classList.add('visible'),     1400);
}

/**
 * Auto-scroll to #finiq at 4500ms — lets the user absorb
 * the avatar intro before being taken to the main content.
 */
function autoScrollToFiniq() {
  setTimeout(() => {
    const finiq = document.getElementById('finiq');
    if (!finiq) return;
    window.scrollTo({ top: finiq.offsetTop, behavior: 'smooth' });
  }, 4500);
}


/* ─────────────────────────────────────────────────────────────
   5. PROGRESS BAR
───────────────────────────────────────────────────────────── */
function initProgressBar() {
  const bar = document.getElementById('progress-bar');
  if (!bar) return;

  function update() {
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    if (maxScroll <= 0) return;
    const progress = Math.min(window.scrollY / maxScroll, 1);
    bar.style.transform = `scaleX(${progress})`;
  }

  window.addEventListener('scroll', update, { passive: true });
  update();
}


/* ─────────────────────────────────────────────────────────────
   6. SIDE-NAV DOTS
───────────────────────────────────────────────────────────── */
function initSideNav() {
  const dots = document.querySelectorAll('.side-dot');

  // Click → scroll to section
  dots.forEach(dot => {
    dot.addEventListener('click', () => {
      const el = document.getElementById(dot.dataset.target);
      if (el) window.scrollTo({ top: el.offsetTop, behavior: 'smooth' });
    });
  });

  // Highlight active dot on scroll
  function updateActiveDot() {
    const mid = window.scrollY + window.innerHeight * 0.4;
    let activeId = sections[0]?.el.id;

    for (const { el } of sections) {
      if (el.offsetTop <= mid) activeId = el.id;
    }

    dots.forEach(dot => {
      dot.classList.toggle('active', dot.dataset.target === activeId);
    });
  }

  window.addEventListener('scroll', updateActiveDot, { passive: true });
  updateActiveDot();
}


/* ─────────────────────────────────────────────────────────────
   7. EXPAND / COLLAPSE BUTTONS
───────────────────────────────────────────────────────────── */
function initExpandButtons() {
  document.querySelectorAll('.expand-btn').forEach(btn => {
    const targetId   = btn.dataset.target;
    const expandable = document.getElementById(targetId);
    if (!expandable) return;

    btn.addEventListener('click', () => {
      const isOpen = expandable.classList.contains('open');
      expandable.classList.toggle('open', !isOpen);
      btn.setAttribute('aria-expanded', String(!isOpen));
      expandable.setAttribute('aria-hidden', String(isOpen));
    });
  });
}


/* ─────────────────────────────────────────────────────────────
   8. SUPABASE — LOAD PROJECTS
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
  const title = escapeHtml(p.title || 'Untitled Project');
  const desc  = escapeHtml(p.description || '');
  const url   = escapeHtml(p.url || p.link || '');

  let tagsHtml = '';
  if (p.tags) {
    const tagList = Array.isArray(p.tags)
      ? p.tags
      : String(p.tags).split(',').map(t => t.trim()).filter(Boolean);
    tagsHtml = tagList.length
      ? `<div class="card-tags">${tagList.map(t => `<span class="card-tag">${escapeHtml(t)}</span>`).join('')}</div>`
      : '';
  }

  const linkHtml = url
    ? `<a href="${url}" class="card-link" target="_blank" rel="noopener noreferrer">View project →</a>`
    : '';

  return `
    <article class="tl-card">
      <h3 class="card-title">${title}</h3>
      ${desc     ? `<p class="card-desc">${desc}</p>` : ''}
      ${tagsHtml}
      ${linkHtml}
    </article>
  `;
}


/* ─────────────────────────────────────────────────────────────
   9. SUPABASE — LOAD CERTIFICATES
───────────────────────────────────────────────────────────── */
async function loadCertificates() {
  const container = document.getElementById('certsContainer');
  if (!container) return;

  try {
    const { data, error } = await db
      .from('certificates')
      .select('*')
      .order('issued_at', { ascending: false });

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
  const title    = escapeHtml(c.title   || c.name  || 'Certificate');
  const issuer   = escapeHtml(c.issuer  || c.org   || '');
  const badgeUrl = escapeHtml(c.badge_url || c.badge || '');
  const certUrl  = escapeHtml(c.cert_url  || c.url   || c.link || '');

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

  const linkHtml = certUrl
    ? `<a href="${certUrl}" class="card-link" target="_blank" rel="noopener noreferrer">View certificate →</a>`
    : '';

  return `
    <article class="tl-card">
      ${badgeHtml}
      <h3 class="card-title">${title}</h3>
      ${issuer   ? `<p class="card-issuer">${issuer}</p>` : ''}
      ${dateHtml}
      ${linkHtml}
    </article>
  `;
}


/* ─────────────────────────────────────────────────────────────
   10. NEWSLETTER FORM
───────────────────────────────────────────────────────────── */
function initNewsletterForm() {
  const form      = document.getElementById('newsletterForm');
  const input     = document.getElementById('newsletterEmail');
  const msgEl     = document.getElementById('newsletterMessage');
  const submitBtn = form ? form.querySelector('.newsletter-submit') : null;
  const btnText   = submitBtn ? submitBtn.querySelector('.btn-text')    : null;
  const btnLoad   = submitBtn ? submitBtn.querySelector('.btn-loading') : null;

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
      const { data: existing, error: checkError } = await db
        .from('newsletter_subscribers')
        .select('email')
        .eq('email', email)
        .maybeSingle();

      if (checkError) throw checkError;

      if (existing) {
        showMessage("You're already subscribed — thanks for the enthusiasm 🙌", 'info');
        setLoading(false);
        return;
      }

      const { error: insertError } = await db
        .from('newsletter_subscribers')
        .insert([{ email }]);

      if (insertError) throw insertError;

      showMessage("You're in! First issue drops April 15. 🚀", 'success');
      form.reset();

    } catch (err) {
      console.error('Newsletter error:', err);
      showMessage('Something went wrong. Please try again.', 'error');
    } finally {
      setLoading(false);
    }
  });

  function setLoading(loading) {
    if (!submitBtn) return;
    submitBtn.disabled = loading;
    if (btnText) btnText.hidden = loading;
    if (btnLoad) btnLoad.hidden = !loading;
  }

  function showMessage(text, type) {
    if (!msgEl) return;
    msgEl.textContent = text;
    msgEl.className   = 'newsletter-message' + (type ? ` ${type}` : '');
  }
}


/* ─────────────────────────────────────────────────────────────
   11. BOOT
───────────────────────────────────────────────────────────── */
function boot() {
  // Collect all panels
  sections = Array.from(document.querySelectorAll('.panel')).map(el => ({
    el,
    inner: el.querySelector('.panel-inner'),
  }));

  // Panel inner reveal via IntersectionObserver
  initReveal();

  // Section 1: avatar animation (immediate)
  runAvatarAnimation();

  // Section 2: about animation (triggers when section 2 enters viewport)
  initAboutAnimation();

  // Auto-scroll to #finiq after 4.5s
  autoScrollToFiniq();

  // UI
  initProgressBar();
  initSideNav();
  initExpandButtons();

  // Data
  loadProjects();
  loadCertificates();
  initNewsletterForm();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
