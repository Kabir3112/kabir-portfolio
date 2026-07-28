/* ═══════════════════════════════════════════════════════════════
   HORIZONTAL LIFE-TIMELINE ("the rail")

   The page still scrolls vertically — that is deliberate. Hijacking
   the wheel to move sideways breaks keyboard scrolling, trackpad
   momentum, the scrollbar and find-in-page. Instead the document
   keeps its normal tall height and we translate a flex track by the
   same proportion, so every native input keeps working and the
   motion reads as horizontal travel.

   Why this fixes the pacing problem: dwell is now uniform by
   construction. Each station is exactly one screen wide, so equal
   wheel distance always buys equal content. The old engine gave
   Projects 335vh and Childhood 126vh for the same gesture.

   Layered on top of app.js rather than replacing it: on narrow
   screens or with prefers-reduced-motion, rail mode never activates
   and the original vertical engine runs untouched.
   ═══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  const MIN_WIDTH   = 900;   // below this, keep the vertical story
  const WIDE_PANELS = ['projects', 'certificates', 'newsletter-section'];

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  let track      = null;
  let viewport   = null;
  let driver     = null;
  let wrap       = null;
  let stations   = [];   // { id, label, el (story-block), button, startPx, widthPx }
  let trackWidth = 0;
  let maxShift   = 0;
  let rafId      = null;
  let active     = false;

  function shouldActivate() {
    return window.innerWidth >= MIN_WIDTH && !reduceMotion.matches;
  }

  /* ── Build the rail DOM around the existing story blocks ─────── */
  function buildRail() {
    wrap = document.getElementById('panels-wrap');
    if (!wrap || wrap.querySelector('.rail-driver')) return false;

    const blocks = [...wrap.querySelectorAll('.story-block')];
    if (!blocks.length) return false;

    /* #panels-wrap also holds the hero sections, so the rail gets its
       own driver element. Setting the height on the wrap itself would
       collapse the hero and put the scroll origin in the wrong place. */
    driver = document.createElement('div');
    driver.className = 'rail-driver';
    viewport = document.createElement('div');
    viewport.className = 'rail-viewport';
    track = document.createElement('div');
    track.className = 'rail-track';
    viewport.appendChild(track);
    driver.appendChild(viewport);

    // Anchor the rail where the first story block sits, so anything
    // before it (the hero) keeps its normal vertical behaviour.
    blocks[0].parentNode.insertBefore(driver, blocks[0]);
    blocks.forEach(b => {
      const panel = b.querySelector('.panel');
      if (panel && WIDE_PANELS.includes(panel.id)) {
        b.dataset.railWide = 'true';
      }
      track.appendChild(b);
    });

    buildTrackUI(blocks);
    return true;
  }

  /* ── The station markers along the bottom ────────────────────── */
  function buildTrackUI(blocks) {
    const ui = document.createElement('div');
    ui.className = 'rail-track-ui';
    ui.innerHTML = '<div class="rail-line"><div class="rail-line-fill"></div></div>';

    const list = document.createElement('div');
    list.className = 'rail-stations';

    // Reuse the labels already written for the side nav so the two
    // never disagree about what a section is called.
    const navLabels = new Map(
      [...document.querySelectorAll('.nav-item')].map(b => [b.dataset.target, b.textContent.trim()])
    );

    blocks.forEach(b => {
      const panel = b.querySelector('.panel');
      if (!panel) return;
      const btn = document.createElement('button');
      btn.className   = 'rail-station';
      btn.type        = 'button';
      btn.textContent = navLabels.get(panel.id) || panel.id;
      btn.dataset.target = panel.id;
      btn.addEventListener('click', () => goToStation(panel.id));
      list.appendChild(btn);
      stations.push({ id: panel.id, el: b, button: btn });
    });

    ui.appendChild(list);
    document.body.appendChild(ui);
  }

  /* ── Measure: track width drives how tall the page must be ───── */
  function measure() {
    if (!track) return;

    // Let the flex track size itself, then read it back.
    trackWidth = track.scrollWidth;
    maxShift   = Math.max(trackWidth - window.innerWidth, 0);

    // Scroll distance == horizontal distance, 1:1. This is what makes
    // the pacing uniform, and it means a station is always exactly one
    // viewport-height of scrolling away.
    driver.style.height = `${maxShift + window.innerHeight}px`;

    let offset = 0;
    stations.forEach(s => {
      s.startPx = offset;
      s.widthPx = s.el.offsetWidth;
      offset += s.widthPx;
    });
  }

  /* ── Per-frame: translate the track and update the markers ───── */
  function update() {
    if (!active || !track) return;

    const railTop  = driver.getBoundingClientRect().top + window.scrollY;
    const scrolled = window.scrollY - railTop;
    const shift    = Math.min(Math.max(scrolled, 0), maxShift);

    track.style.setProperty('--rail-x', `${-shift}px`);

    const progress = maxShift > 0 ? (shift / maxShift) * 100 : 0;
    const fill = document.querySelector('.rail-line-fill');
    if (fill) fill.style.setProperty('--rail-progress', `${progress}%`);

    // Focus: 1 when a station is centred, falling off toward the edges.
    const centre = shift + window.innerWidth / 2;
    let current = stations[0];
    stations.forEach(s => {
      const sCentre = s.startPx + s.widthPx / 2;
      const dist    = Math.abs(sCentre - centre);
      const focus   = Math.max(0, 1 - dist / (window.innerWidth * 0.85));
      s.el.style.setProperty('--station-focus', focus.toFixed(3));

      if (shift >= s.startPx - window.innerWidth * 0.4) current = s;
    });

    stations.forEach(s => {
      s.button.setAttribute('aria-current', String(s === current));
    });
  }

  function onScroll() {
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
      update();
      rafId = null;
    });
  }

  /* ── Jump to a station ───────────────────────────────────────── */
  function goToStation(id) {
    const s = stations.find(x => x.id === id);
    if (!s) return;
    window.scrollTo({
      top: driver.getBoundingClientRect().top + window.scrollY + s.startPx,
      behavior: reduceMotion.matches ? 'auto' : 'smooth'
    });
  }

  /* ── First-visit hint ────────────────────────────────────────── */
  function showHint() {
    const hint = document.createElement('div');
    hint.className = 'rail-hint';
    hint.innerHTML = 'Scroll to travel <span aria-hidden="true">→</span>';
    document.body.appendChild(hint);

    const dismiss = () => {
      hint.classList.add('is-gone');
      setTimeout(() => hint.remove(), 400);
      window.removeEventListener('scroll', dismiss);
    };
    window.addEventListener('scroll', dismiss, { passive: true, once: true });
    setTimeout(dismiss, 6000);
  }

  /* ── Wire the existing side-nav buttons to the rail ───────────── */
  function patchNav() {
    document.querySelectorAll('.nav-item, .mob-nav-item').forEach(btn => {
      btn.addEventListener('click', e => {
        const id = btn.dataset.target;
        if (active && stations.some(s => s.id === id)) {
          e.stopImmediatePropagation();
          goToStation(id);
        }
      }, true);
    });
  }

  function activate() {
    if (active) return;
    document.body.classList.add('rail-mode');
    active = true;
    measure();
    update();
  }

  function deactivate() {
    if (!active) return;
    document.body.classList.remove('rail-mode');
    driver.style.height = '';
    active = false;
  }

  function init() {
    if (!buildRail()) return;
    patchNav();

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', () => {
      if (shouldActivate()) {
        activate();
        measure();
        update();
      } else {
        deactivate();
      }
    }, { passive: true });

    if (shouldActivate()) {
      activate();
      showHint();
    }

    // Fonts and lazy images change station widths after first paint.
    window.addEventListener('load', () => {
      if (active) { measure(); update(); }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Cards arrive from Supabase after boot and change station width.
  window.railRemeasure = () => { if (active) { measure(); update(); } };
})();
