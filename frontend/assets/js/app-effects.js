/* app-effects.js — interatividade compartilhada das telas internas
   (reveal on scroll, ripple, contador animado, indicador de abas) */

var REDUCE_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ===== Reveal on scroll ===== */
function initReveal() {
  var els = document.querySelectorAll('[data-reveal]');
  if (!els.length) return;

  if (REDUCE_MOTION || !window.IntersectionObserver) {
    els.forEach(function (el) { el.classList.add('reveal', 'in-view'); });
    return;
  }

  var obs = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('in-view');
        obs.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15 });

  els.forEach(function (el, i) {
    el.classList.add('reveal');
    el.style.transitionDelay = Math.min(i * 60, 300) + 'ms';
    obs.observe(el);
  });
}

/* ===== Ripple nos botões ===== */
function initRipple() {
  if (REDUCE_MOTION) return;
  document.addEventListener('click', function (ev) {
    var btn = ev.target.closest('.btn');
    if (!btn || btn.disabled) return;

    var rect = btn.getBoundingClientRect();
    var size = Math.max(rect.width, rect.height);
    var ripple = document.createElement('span');
    ripple.className = 'btn-ripple';
    ripple.style.width = ripple.style.height = size + 'px';
    ripple.style.left = (ev.clientX - rect.left - size / 2) + 'px';
    ripple.style.top = (ev.clientY - rect.top - size / 2) + 'px';
    btn.appendChild(ripple);
    ripple.addEventListener('animationend', function () { ripple.remove(); });
  });
}

/* ===== Contador animado ===== */
function animateNumber(el, end, opts) {
  opts = opts || {};
  end = Number(end) || 0;
  var format = opts.format || function (v) { return Math.round(v).toLocaleString('pt-BR'); };

  if (REDUCE_MOTION) {
    el.textContent = format(end);
    return;
  }

  var duration = opts.duration || 800;
  var start = 0;
  var startTime = null;

  function step(ts) {
    if (!startTime) startTime = ts;
    var progress = Math.min((ts - startTime) / duration, 1);
    var eased = 1 - Math.pow(1 - progress, 3);
    el.textContent = format(start + (end - start) * eased);
    if (progress < 1) {
      requestAnimationFrame(step);
    } else {
      el.textContent = format(end);
      el.classList.add('count-pop');
      setTimeout(function () { el.classList.remove('count-pop'); }, 400);
    }
  }
  requestAnimationFrame(step);
}

/* ===== Indicador deslizante de abas ===== */
function initTabsIndicator(container) {
  if (!container) return;

  var indicator = document.createElement('span');
  indicator.className = 'tab-indicator';
  container.appendChild(indicator);

  function move(tab) {
    if (!tab) { indicator.style.width = '0'; return; }
    indicator.style.width = tab.offsetWidth + 'px';
    indicator.style.transform = 'translateX(' + tab.offsetLeft + 'px)';
  }

  requestAnimationFrame(function () { move(container.querySelector('.tab.active')); });

  container.addEventListener('click', function (ev) {
    var tab = ev.target.closest('.tab');
    if (tab) requestAnimationFrame(function () { move(tab); });
  });

  window.addEventListener('resize', debounce(function () {
    move(container.querySelector('.tab.active'));
  }, 150));
}

/* ===== Botão em estado de carregamento ===== */
function setBtnLoading(btn, loadingText) {
  if (!btn.dataset.originalHtml) btn.dataset.originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner spinner-sm"></span>' + loadingText;
}
function resetBtnLoading(btn) {
  btn.disabled = false;
  if (btn.dataset.originalHtml) {
    btn.innerHTML = btn.dataset.originalHtml;
    fillIcons(btn);
  }
}

document.addEventListener('DOMContentLoaded', function () {
  initReveal();
  initRipple();
});
