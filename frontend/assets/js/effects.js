/* effects.js — cursor, parallax, card tilt, nav scroll
   Inspired by landonorris.com & lusion.co */

/* ══════════════════════════════════════════════════
   0. SITE-WIDE SHINE OVERLAY
   Um único div fixo com mix-blend-mode varre luz
   por toda a página continuamente.
   ══════════════════════════════════════════════════ */
(function () {
  var shine = document.createElement('div');
  shine.id = 'site-shine';
  document.body.appendChild(shine);
})();

/* ══════════════════════════════════════════════════
   1. MAGNETIC BUTTONS (landonorris.com)
   ══════════════════════════════════════════════════ */
(function () {
  if (window.matchMedia('(hover: none)').matches) return;

  function attachMagnetic(selector) {
    document.querySelectorAll(selector).forEach(function (el) {
      el.addEventListener('mousemove', function (e) {
        var r  = el.getBoundingClientRect();
        var dx = (e.clientX - r.left - r.width  / 2) * 0.40;
        var dy = (e.clientY - r.top  - r.height / 2) * 0.40;
        el.style.transition = 'transform 0.08s';
        el.style.transform  = 'translate(' + dx + 'px,' + dy + 'px)';
      });
      el.addEventListener('mouseleave', function () {
        el.style.transform  = '';
        el.style.transition = 'transform 0.55s cubic-bezier(.25,.46,.45,.94), background-color 0.15s, box-shadow 0.15s';
        setTimeout(function () { el.style.transition = ''; }, 600);
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { attachMagnetic('.btn-primary, .btn-lg'); });
  } else {
    attachMagnetic('.btn-primary, .btn-lg');
  }
})();


/* ══════════════════════════════════════════════════
   2. PARALLAX HERO (landonorris.com)
   Hero visual floats up faster than hero copy,
   creating depth as the user scrolls.
   ══════════════════════════════════════════════════ */
(function () {
  var heroVisual = document.querySelector('.hero-visual');
  var heroCopy   = document.querySelector('.hero-copy');
  if (!heroVisual || !heroCopy) return;

  var ticking = false;

  window.addEventListener('scroll', function () {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      var y = window.scrollY;
      // visual moves up faster (depth layer behind text)
      heroVisual.style.transform = 'translateY(' + (y * -0.18) + 'px)';
      // copy moves up slightly slower (feels closer to viewer)
      heroCopy.style.transform   = 'translateY(' + (y * -0.08) + 'px)';
      ticking = false;
    });
  }, { passive: true });
})();


/* ══════════════════════════════════════════════════
   3. 3D CARD TILT (lusion.co image hover style)
   Cards rotate on the pointer axes as you move
   the mouse — perspective depth effect.
   ══════════════════════════════════════════════════ */
(function () {
  if (window.matchMedia('(hover: none)').matches) return;

  var TILT = 10;   // max degrees
  var LIFT = 6;    // translateY on hover (px)
  var PERSP = 800; // perspective distance (px)

  function attachTilt(selector) {
    document.querySelectorAll(selector).forEach(function (el) {
      el.style.willChange = 'transform';
      el.style.transition = 'transform 0.4s cubic-bezier(.03,.98,.52,.99)';

      el.addEventListener('mouseenter', function () {
        el.style.transition = 'transform 0.1s';
      });

      el.addEventListener('mousemove', function (e) {
        var r   = el.getBoundingClientRect();
        var px  = (e.clientX - r.left)  / r.width;   // 0..1
        var py  = (e.clientY - r.top)   / r.height;  // 0..1
        var rx  = (py - 0.5) * -TILT * 2;            // rotateX
        var ry  = (px - 0.5) *  TILT * 2;            // rotateY
        el.style.transform =
          'perspective(' + PERSP + 'px) rotateX(' + rx + 'deg) rotateY(' + ry + 'deg) translateY(-' + LIFT + 'px)';
      });

      el.addEventListener('mouseleave', function () {
        el.style.transition = 'transform 0.6s cubic-bezier(.03,.98,.52,.99)';
        el.style.transform  = '';
      });
    });
  }

  // Apply to testimony and step cards — NOT plan-card (has electric border + its own hover)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      attachTilt('.depoimento-card, .step-card');
    });
  } else {
    attachTilt('.depoimento-card, .step-card');
  }
})();


/* ══════════════════════════════════════════════════
   4. NAV SCROLL SHRINK
   Nav becomes denser and more opaque on scroll —
   common on Linear, Vercel, landonorris.com.
   ══════════════════════════════════════════════════ */
(function () {
  var nav = document.getElementById('site-nav');
  if (!nav) return;

  var ticking = false;
  var scrolled = false;

  window.addEventListener('scroll', function () {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      var y = window.scrollY;
      if (y > 60 && !scrolled) {
        nav.classList.add('scrolled');
        scrolled = true;
      } else if (y <= 60 && scrolled) {
        nav.classList.remove('scrolled');
        scrolled = false;
      }
      ticking = false;
    });
  }, { passive: true });
})();
