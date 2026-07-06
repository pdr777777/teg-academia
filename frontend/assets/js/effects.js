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
   4A. NOISE GRAIN OVERLAY
   ══════════════════════════════════════════════════ */
(function () {
  var el = document.createElement('div');
  el.id = 'noise-overlay';
  document.body.appendChild(el);
})();


/* ══════════════════════════════════════════════════
   4B. SCROLL PROGRESS BAR
   ══════════════════════════════════════════════════ */
(function () {
  var bar = document.createElement('div');
  bar.id = 'scroll-progress';
  document.body.appendChild(bar);

  var ticking = false;
  window.addEventListener('scroll', function () {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(function () {
      var scrolled = window.scrollY;
      var total    = document.documentElement.scrollHeight - window.innerHeight;
      bar.style.width = total > 0 ? ((scrolled / total) * 100) + '%' : '0%';
      ticking = false;
    });
  }, { passive: true });
})();


/* ══════════════════════════════════════════════════
   4C. SPOTLIGHT CARD (react-bits)
   Radial glow follows cursor on gallery cards.
   ══════════════════════════════════════════════════ */
(function () {
  if (window.matchMedia('(hover: none)').matches) return;

  function attachSpotlight() {
    document.querySelectorAll('.spotlight-card').forEach(function (el) {
      el.addEventListener('mousemove', function (e) {
        var r = el.getBoundingClientRect();
        el.style.setProperty('--sx', (e.clientX - r.left) + 'px');
        el.style.setProperty('--sy', (e.clientY - r.top)  + 'px');
      });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', attachSpotlight);
  } else {
    attachSpotlight();
  }
})();


/* ══════════════════════════════════════════════════
   4D. GALLERY DRAG SCROLL
   Click-drag on desktop to scroll the gallery.
   ══════════════════════════════════════════════════ */
(function () {
  function initGallery() {
    var track = document.querySelector('.gallery-track');
    if (!track || window.matchMedia('(hover: none)').matches) return;

    var isDown = false, startX = 0, scrollLeft = 0;

    track.addEventListener('mousedown', function (e) {
      isDown    = true;
      startX    = e.pageX - track.offsetLeft;
      scrollLeft = track.scrollLeft;
      track.style.userSelect   = 'none';
      track.style.scrollSnapType = 'none';
    });
    document.addEventListener('mouseup', function () {
      if (!isDown) return;
      isDown = false;
      track.style.userSelect    = '';
      track.style.scrollSnapType = 'x mandatory';
    });
    track.addEventListener('mouseleave', function () {
      if (!isDown) return;
      isDown = false;
      track.style.userSelect    = '';
      track.style.scrollSnapType = 'x mandatory';
    });
    track.addEventListener('mousemove', function (e) {
      if (!isDown) return;
      e.preventDefault();
      var x    = e.pageX - track.offsetLeft;
      var walk = (x - startX) * 1.5;
      track.scrollLeft = scrollLeft - walk;
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initGallery);
  } else {
    initGallery();
  }
})();


/* ══════════════════════════════════════════════════
   4E. WORD SPLIT ANIMATION
   Section headings animate word-by-word on reveal.
   Each word fades up with a staggered delay.
   ══════════════════════════════════════════════════ */
(function () {
  if (!window.IntersectionObserver) return;

  function makeWord(text, i) {
    var span = document.createElement('span');
    span.className = 'w-anim';
    span.style.cssText =
      'display:inline-block;' +
      'opacity:0;' +
      'transform:translateY(14px);' +
      'transition:' +
        'transform .7s cubic-bezier(.16,1,.3,1) ' + (100 + i * 60) + 'ms,' +
        'opacity .5s ease ' + (100 + i * 60) + 'ms;';
    if (text !== null) span.textContent = text;
    return span;
  }

  function splitEl(el) {
    if (el.dataset.wsplit) return;
    el.dataset.wsplit = '1';

    var nodes = Array.from(el.childNodes);
    el.innerHTML = '';
    var idx = 0;

    nodes.forEach(function (node) {
      if (node.nodeType === 3) {
        // Text node — split by word boundaries
        var parts = node.textContent.split(/(\s+)/);
        parts.forEach(function (p) {
          if (!p) return;
          if (/^\s+$/.test(p)) {
            el.appendChild(document.createTextNode(p));
          } else {
            el.appendChild(makeWord(p, idx++));
          }
        });
      } else if (node.nodeType === 1) {
        if (node.tagName === 'BR') {
          el.appendChild(document.createElement('br'));
        } else {
          // Treat entire element (e.g. .text-primary span) as one word block
          var wrap = makeWord(null, idx++);
          wrap.appendChild(node.cloneNode(true));
          el.appendChild(wrap);
        }
      }
    });

    var obs = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        el.querySelectorAll('.w-anim').forEach(function (span) {
          span.style.opacity   = '1';
          span.style.transform = 'none';
        });
        obs.disconnect();
      });
    }, { threshold: 0.25, rootMargin: '0px 0px -30px 0px' });

    obs.observe(el);
  }

  function initWordSplit() {
    document.querySelectorAll('.section-head h2').forEach(splitEl);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWordSplit);
  } else {
    initWordSplit();
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
