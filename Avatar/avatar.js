/**
 * EyeTracker
 * Moves eyeball PNGs within eye sockets to follow the mouse cursor.
 * Movement is translation-based (slides within the socket), not rotation.
 *
 * CALIBRATION (first-time setup):
 *   1. Set data-debug="true" on your .avatar-wrapper element
 *   2. Click: left eye CENTER → left eye socket EDGE → right eye CENTER → right eye socket EDGE
 *   3. Console outputs ready-to-paste CSS — copy it into avatar.css
 *   4. Set data-debug="false" and reload
 *
 * OPTIONS:
 *   lerpSpeed    {number}  0–1, smoothness of following. Lower = dreamier. Default: 0.08
 *   socketRadius {number}  Radius (px) of the visible eye socket white area.
 *                          The eyeball EDGE will never go beyond this boundary.
 *                          Calibration outputs the correct value automatically.
 *   minDist      {number}  Min cursor distance before movement starts (prevents jitter). Default: 20
 *   idleDelay    {number}  ms before idle drift begins. Default: 2000
 */
class EyeTracker {
  constructor(container, options = {}) {
    this.container = container;

    this.opts = {
      lerpSpeed:    0.08,
      socketRadius: 8,   // px — radius of the eye socket white area
      minDist:      20,
      idleDelay:    2000,
      ...options,
    };

    // Each eye tracks its own x/y offset independently
    this.eyes = [...container.querySelectorAll('.eyeball')].map(el => ({
      el,
      x: 0,
      y: 0,
    }));

    this.mouse      = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    this.lastMoveAt = Date.now();
    this.idleClock  = 0;

    this._handleMouseMove = (e) => {
      this.mouse.x    = e.clientX;
      this.mouse.y    = e.clientY;
      this.lastMoveAt = Date.now();
    };

    window.addEventListener('mousemove', this._handleMouseMove);

    if (container.dataset.debug === 'true') {
      this._initDebugMode();
    }

    this._raf = requestAnimationFrame(this._tick.bind(this));
  }

  _lerp(current, target, t) {
    return current + (target - current) * t;
  }

  _tick() {
    const isIdle = (Date.now() - this.lastMoveAt) > this.opts.idleDelay;

    for (const eye of this.eyes) {
      let targetX, targetY;

      // Half the eyeball's rendered width — used to keep the EDGE within the socket
      const eyeballHalfSize = eye.el.getBoundingClientRect().width / 2;

      // Max the CENTER can move = socket radius minus the eyeball's own radius
      // This ensures the eyeball EDGE never exits the socket boundary
      const effectiveMax = Math.max(0, this.opts.socketRadius - eyeballHalfSize);

      if (isIdle) {
        // Idle drift: gentle wander when mouse is inactive
        this.idleClock += 0.008;
        targetX = Math.sin(this.idleClock)       * effectiveMax * 0.6;
        targetY = Math.sin(this.idleClock * 0.7) * effectiveMax * 0.4;
      } else {
        this.idleClock = 0;

        const rect = eye.el.getBoundingClientRect();
        const cx   = rect.left + rect.width  / 2;
        const cy   = rect.top  + rect.height / 2;

        const dx   = this.mouse.x - cx;
        const dy   = this.mouse.y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < this.opts.minDist) {
          targetX = eye.x;
          targetY = eye.y;
        } else {
          // Normalize direction, scale to effectiveMax
          const influence = Math.min(dist / 200, 1);
          targetX = (dx / dist) * effectiveMax * influence;
          targetY = (dy / dist) * effectiveMax * influence;
        }
      }

      eye.x = this._lerp(eye.x, targetX, this.opts.lerpSpeed);
      eye.y = this._lerp(eye.y, targetY, this.opts.lerpSpeed);

      eye.el.style.transform = `translate(calc(-50% + ${eye.x}px), calc(-50% + ${eye.y}px))`;
    }

    this._raf = requestAnimationFrame(this._tick.bind(this));
  }

  /**
   * Debug / calibration mode.
   * Click in order:
   *   1. Left eye CENTER
   *   2. Left eye socket EDGE  (the rim of the white/iris area)
   *   3. Right eye CENTER
   *   4. Right eye socket EDGE
   *
   * Console outputs ready-to-paste CSS and the correct socketRadius value.
   */
  _initDebugMode() {
    console.log(
      '%c[EyeTracker] Debug ON\n' +
      'Click in order:\n' +
      '  1. Left eye CENTER\n' +
      '  2. Left eye socket EDGE\n' +
      '  3. Right eye CENTER\n' +
      '  4. Right eye socket EDGE',
      'color: orange; font-weight: bold'
    );

    this.container.style.cursor = 'crosshair';

    const clicks = [];
    const labels = [
      'Left eye CENTER',
      'Left eye socket EDGE',
      'Right eye CENTER',
      'Right eye socket EDGE',
    ];

    this.container.addEventListener('click', (e) => {
      const rect = this.container.getBoundingClientRect();
      const x    = e.clientX - rect.left;
      const y    = e.clientY - rect.top;
      const xPct = (x / rect.width  * 100).toFixed(1);
      const yPct = (y / rect.height * 100).toFixed(1);

      clicks.push({ x, y, xPct, yPct });
      console.log(`[${clicks.length}/4] ${labels[clicks.length - 1]} → left: ${xPct}%, top: ${yPct}%`);

      if (clicks.length === 4) {
        const [lCenter, lEdge, rCenter, rEdge] = clicks;

        const lRadius = Math.sqrt((lEdge.x - lCenter.x) ** 2 + (lEdge.y - lCenter.y) ** 2);
        const rRadius = Math.sqrt((rEdge.x - rCenter.x) ** 2 + (rEdge.y - rCenter.y) ** 2);
        const avgRadius = (lRadius + rRadius) / 2;

        // Eyeball image sized to the iris (~65% of full socket diameter)
        const diameterPct = (((avgRadius * 2) / rect.width) * 100 * 0.65).toFixed(1);

        // socketRadius = the measured socket radius in px
        // The JS uses this to keep the eyeball EDGE within bounds automatically
        const socketRadius = Math.round(avgRadius);

        console.log('%c--- Copy this into avatar.css ---', 'color: lime; font-weight: bold');
        console.log(
          `.eye-left  { left: ${lCenter.xPct}%; top: ${lCenter.yPct}%; }\n` +
          `.eye-right { left: ${rCenter.xPct}%; top: ${rCenter.yPct}%; }\n` +
          `.eyeball   { width: ${diameterPct}%; }`
        );
        console.log('%c--- Update socketRadius in avatar.js init ---', 'color: cyan; font-weight: bold');
        console.log(`socketRadius: ${socketRadius},  // px — eyeball edge will never exit this boundary`);
      }
    });
  }

  destroy() {
    window.removeEventListener('mousemove', this._handleMouseMove);
    cancelAnimationFrame(this._raf);
  }
}

// ─── Init ────────────────────────────────────────────────────────────────────

document.querySelectorAll('.avatar-wrapper').forEach(wrapper => {
  new EyeTracker(wrapper, {
    lerpSpeed:    0.08,
    socketRadius: 9,   // ← set this to the socket radius from calibration
  });
});
