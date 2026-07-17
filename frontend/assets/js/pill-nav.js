// pill-nav.js — porte em JS puro (GSAP) do componente PillNav do React Bits
// (github.com/DavidHDev/react-bits): a onda que cobre o pill no hover.
// Sem React/react-router — aqui é sempre <a href>.
(function () {
  var REDUCE_MOTION = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var EASE = 'power3.out';

  function initPillHover(container) {
    if (!container || !window.gsap || REDUCE_MOTION) return;

    var pills = Array.prototype.slice.call(container.querySelectorAll('.pill'));
    var timelines = [];
    var activeTweens = [];

    function layout() {
      pills.forEach(function (pill, i) {
        var circle = pill.querySelector('.hover-circle');
        if (!circle) return;

        var rect = pill.getBoundingClientRect();
        var w = rect.width, h = rect.height;
        if (!w || !h) return;

        var R = ((w * w) / 4 + h * h) / (2 * h);
        var D = Math.ceil(2 * R) + 2;
        var delta = Math.ceil(R - Math.sqrt(Math.max(0, R * R - (w * w) / 4))) + 1;
        var originY = D - delta;

        circle.style.width = D + 'px';
        circle.style.height = D + 'px';
        circle.style.bottom = -delta + 'px';

        gsap.set(circle, { xPercent: -50, scale: 0, transformOrigin: '50% ' + originY + 'px' });

        var label = pill.querySelector('.pill-label');
        var hoverLabel = pill.querySelector('.pill-label-hover');
        if (label) gsap.set(label, { y: 0 });
        if (hoverLabel) gsap.set(hoverLabel, { y: h + 12, opacity: 0 });

        var tl = gsap.timeline({ paused: true });
        tl.to(circle, { scale: 1.2, xPercent: -50, duration: 2, ease: EASE, overwrite: 'auto' }, 0);
        if (label) tl.to(label, { y: -(h + 8), duration: 2, ease: EASE, overwrite: 'auto' }, 0);
        if (hoverLabel) {
          gsap.set(hoverLabel, { y: Math.ceil(h + 100), opacity: 0 });
          tl.to(hoverLabel, { y: 0, opacity: 1, duration: 2, ease: EASE, overwrite: 'auto' }, 0);
        }
        timelines[i] = tl;
      });
    }

    layout();
    if (window.ResizeObserver) new ResizeObserver(layout).observe(container);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(layout).catch(function () {});

    pills.forEach(function (pill, i) {
      pill.addEventListener('mouseenter', function () {
        var tl = timelines[i];
        if (!tl) return;
        activeTweens[i] && activeTweens[i].kill();
        activeTweens[i] = tl.tweenTo(tl.duration(), { duration: 0.3, ease: EASE, overwrite: 'auto' });
      });
      pill.addEventListener('mouseleave', function () {
        var tl = timelines[i];
        if (!tl) return;
        activeTweens[i] && activeTweens[i].kill();
        activeTweens[i] = tl.tweenTo(0, { duration: 0.2, ease: EASE, overwrite: 'auto' });
      });
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    initPillHover(document.getElementById('site-nav-links'));
  });
})();
