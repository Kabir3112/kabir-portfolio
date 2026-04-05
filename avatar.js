/**
 * EyeTracker
 * Rotates eyeball PNGs inside an avatar to follow the mouse cursor.
 *
 * Usage:
 *   new EyeTracker(document.querySelector('.avatar-wrapper'));
 *
 * Calibration:
 *   Set data-debug="true" on the wrapper, then click each eye center.
 *   The console logs the left/top percentages — paste into CSS, then remove debug.
 */
class EyeTracker {
  constructor(container, options = {}) {
    this.container = container;

    this.opts = {
      lerpSpeed:   0.08,  // 0–1: lower = dreamier/slower, higher = snappier
      pupilOffset: 90,    // degrees: corrects for pupil position in the PNG
                          // 90  = pupil points UP in the PNG (most common)
                          // 0   = pupil points RIGHT
                          // 180 = pupil points DOWN
      minDist:     20,    // px: cursor must be this far from eye center before
                          //     rotation kicks in — prevents jitter on hover
      idleDelay:   2000,  // ms: time before idle drift begins
      ...options,
    };

    // Each eye tracks its own lerped angle independently
    this.eyes = [...container.querySelectorAll('.eyeball')].map(el => ({
      el,
      angle: 0, // current lerped angle in radians
    }));

    // Start mouse in screen center so eyes don't snap on load
    this.mouse = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    this.lastMoveAt = Date.now();
    this.idleClock  = 0; // drives the idle drift oscillation

    this._handleMouseMove = (e) => {
      this.mouse.x   = e.clientX;
      this.mouse.y   = e.clientY;
      this.lastMoveAt = Date.now();
    };

    window.addEventListener('mousemove', this._handleMouseMove);

    if (container.dataset.debug === 'true') {
      this._initDebugMode();
    }

    // Kick off the animation loop
    this._raf = requestAnimationFrame(this._tick.bind(this));
  }

  /**
   * Lerp between two angles along the SHORTEST arc.
   * Prevents the eyeball from spinning 350° when it could go 10° the other way.
   */
  _lerpAngle(current, target, t) {
    let diff = target - current;
    // Clamp diff to [-π, π] — always take the short way around
    while (diff >  Math.PI) diff -= 2 * Math.PI;
    while (diff < -Math.PI) diff += 2 * Math.PI;
    return current + diff * t;
  }

  _tick() {
    const isIdle = (Date.now() - this.lastMoveAt) > this.opts.idleDelay;

    for (const eye of this.eyes) {
      // Get this eye's center in viewport coordinates (recalculated each frame
      // so it works correctly if the page scrolls or layout shifts)
      const rect = eye.el.getBoundingClientRect();
      const cx = rect.left + rect.width  / 2;
      const cy = rect.top  + rect.height / 2;

      let targetAngle;

      if (isIdle) {
        // Idle drift: slow sinusoidal wander, like the character looking around
        this.idleClock += 0.008;
        targetAngle = Math.sin(this.idleClock) * 0.4; // ±0.4 rad (~23°)
      } else {
        this.idleClock = 0;

        const dx   = this.mouse.x - cx;
        const dy   = this.mouse.y - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < this.opts.minDist) {
          // Cursor is directly over the eye — hold current angle to avoid jitter
          targetAngle = eye.angle;
        } else {
          // atan2 returns the angle FROM eye center TO cursor, in radians
          targetAngle = Math.atan2(dy, dx);
        }
      }

      // Smooth step: lerp current angle toward target (ease-out feel)
      eye.angle = this._lerpAngle(eye.angle, targetAngle, this.opts.lerpSpeed);

      // Convert radians → degrees, apply pupil offset, apply transform
      const deg = (eye.angle * 180 / Math.PI) + this.opts.pupilOffset;

      //   translate(-50%, -50%)  — centers the element on its left/top point
      //   rotate(deg)            — spins it to face the cursor
      eye.el.style.transform = `translate(-50%, -50%) rotate(${deg}deg)`;
    }

    this._raf = requestAnimationFrame(this._tick.bind(this));
  }

  /**
   * Debug / calibration mode.
   * Click anywhere on the avatar to log that point as a left/top percentage.
   * Use those values in .eye-left and .eye-right CSS rules.
   */
  _initDebugMode() {
    console.log(
      '%c[EyeTracker] Debug ON — click each eye center to get its CSS position',
      'color: orange; font-weight: bold'
    );
    this.container.style.cursor = 'crosshair';

    this.container.addEventListener('click', (e) => {
      const rect = this.container.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width  * 100).toFixed(1);
      const y = ((e.clientY - rect.top)  / rect.height * 100).toFixed(1);
      console.log(`Eye center → left: ${x}%; top: ${y}%;`);
    });
  }

  destroy() {
    window.removeEventListener('mousemove', this._handleMouseMove);
    cancelAnimationFrame(this._raf);
  }
}

// ─── Init ────────────────────────────────────────────────────────────────────
// Works for every .avatar-wrapper on the page — handles your "used twice" case

document.querySelectorAll('.avatar-wrapper').forEach(wrapper => {
  new EyeTracker(wrapper, {
    lerpSpeed:   0.08,
    pupilOffset: 90,   // ← change this first if eyes point wrong direction
  });
});
