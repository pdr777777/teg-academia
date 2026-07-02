/* effects.js — cursor glow + ring lag + magnetic buttons
   Inspired by landonorris.com (cursor, magnetic) and lusion.co (ambient glow) */

(function () {
  // ── Touch / no-hover devices: skip entirely ──
  if (window.matchMedia('(hover: none)').matches) return;

  /* ── Inject DOM elements ── */
  var glow = document.createElement('div');
  glow.id = 'cursor-glow';

  var ring = document.createElement('div');
  ring.id = 'cursor-ring';

  var dot = document.createElement('div');
  dot.id = 'cursor-dot';

  document.body.appendChild(glow);
  document.body.appendChild(ring);
  document.body.appendChild(dot);

  document.body.classList.add('custom-cursor');

  /* ── State ── */
  var mx = -500, my = -500;  // mouse (raw)
  var rx = -500, ry = -500;  // ring (lagged)
  var gx = -500, gy = -500;  // glow (slower lag)

  document.addEventListener('mousemove', function (e) {
    mx = e.clientX;
    my = e.clientY;
  });

  /* ── RAF loop ── */
  function tick() {
    // ring follows with ~0.11 lerp factor (snappy but visible lag)
    rx += (mx - rx) * 0.11;
    ry += (my - ry) * 0.11;

    // glow follows slower (~0.055)
    gx += (mx - gx) * 0.055;
    gy += (my - gy) * 0.055;

    ring.style.transform = 'translate(' + (rx - 17) + 'px,' + (ry - 17) + 'px)';
    dot.style.transform  = 'translate(' + (mx - 2.5) + 'px,' + (my - 2.5) + 'px)';
    glow.style.transform = 'translate(' + (gx - 250) + 'px,' + (gy - 250) + 'px)';

    requestAnimationFrame(tick);
  }
  tick();

  /* ── Hover state — ring grows, dot turns white ── */
  document.addEventListener('mouseover', function (e) {
    var interactive = e.target.closest('a, button, .btn, input, textarea, select, label, [role="button"], [tabindex]');
    if (interactive) {
      ring.classList.add('is-hover');
      dot.classList.add('is-hover');
    } else {
      ring.classList.remove('is-hover');
      dot.classList.remove('is-hover');
    }
  });

  /* ── Magnetic buttons — landonorris.com style ──
     Buttons gently attract the cursor when nearby */
  function attachMagnetic(selector) {
    document.querySelectorAll(selector).forEach(function (el) {
      el.addEventListener('mousemove', function (e) {
        var r  = el.getBoundingClientRect();
        var cx = r.left + r.width  / 2;
        var cy = r.top  + r.height / 2;
        var dx = (e.clientX - cx) * 0.40;
        var dy = (e.clientY - cy) * 0.40;
        el.style.transform  = 'translate(' + dx + 'px,' + dy + 'px)';
        el.style.transition = 'transform 0.08s';
      });

      el.addEventListener('mouseleave', function () {
        el.style.transform  = '';
        el.style.transition = 'transform 0.55s cubic-bezier(.25,.46,.45,.94), background-color 0.15s, box-shadow 0.15s';
        // clear the custom transition after spring resolves
        setTimeout(function () {
          el.style.transition = '';
        }, 600);
      });
    });
  }

  // run after DOM is ready so dynamically-rendered buttons are found
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { attachMagnetic('.btn-primary, .btn-lg'); });
  } else {
    attachMagnetic('.btn-primary, .btn-lg');
  }

})();
