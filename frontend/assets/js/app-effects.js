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
function initTabsIndicator(container, opts) {
  if (!container) return;
  opts = opts || {};
  var gooey = !!opts.gooey;

  // Modo gooey: a pill vive num wrapper filtrado (blur+contrast = efeito "goo",
  // porte do GooeyNav do React Bits), pra não borrar o texto das abas junto.
  var mount = container;
  if (gooey) {
    container.classList.add('tabs-gooey');
    mount = document.createElement('span');
    mount.className = 'tab-indicator-wrap';
    container.appendChild(mount);
  }

  var indicator = document.createElement('span');
  indicator.className = 'tab-indicator';
  mount.appendChild(indicator);

  function move(tab) {
    if (!tab) { indicator.style.width = '0'; return; }
    indicator.style.width = tab.offsetWidth + 'px';
    indicator.style.transform = 'translateX(' + tab.offsetLeft + 'px)';
  }

  function burst(fromTab, toTab) {
    if (!gooey || REDUCE_MOTION) return;
    var fromCenter = fromTab.offsetLeft + fromTab.offsetWidth / 2;
    var toCenter = toTab.offsetLeft + toTab.offsetWidth / 2;
    var dxTarget = toCenter - fromCenter;
    for (var i = 0; i < 6; i++) {
      var p = document.createElement('span');
      p.className = 'tab-particle';
      var size = 6 + Math.random() * 8;
      var dx = dxTarget * (0.4 + Math.random() * 0.6) + (Math.random() - 0.5) * 24;
      var dy = (Math.random() - 0.5) * 14;
      var time = 400 + Math.random() * 220;
      p.style.width = size + 'px';
      p.style.height = size + 'px';
      p.style.left = fromCenter + 'px';
      p.style.setProperty('--dx', dx + 'px');
      p.style.setProperty('--dy', dy + 'px');
      p.style.setProperty('--time', time + 'ms');
      mount.appendChild(p);
      (function (el, t) { setTimeout(function () { el.remove(); }, t + 60); })(p, time);
    }
  }

  requestAnimationFrame(function () { move(container.querySelector('.tab.active')); });

  container.addEventListener('click', function (ev) {
    var tab = ev.target.closest('.tab');
    if (!tab) return;
    var prev = container.querySelector('.tab.active');
    requestAnimationFrame(function () { move(tab); });
    if (prev && prev !== tab) burst(prev, tab);
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

/* ===== Gráfico de linha suave com área (sem dependências) =====
   dados: [{ mes: 'YYYY-MM', valor: number }]
   opts: { format(valor), gradientId } */
function renderLineChart(containerId, dados, opts) {
  opts = opts || {};
  var el = document.getElementById(containerId);
  if (!el) return;
  if (!dados || !dados.length) {
    el.innerHTML = '<div class="empty-state">Sem dados registrados ainda.</div>';
    return;
  }

  var format = opts.format || function (v) { return Math.round(v).toLocaleString('pt-BR'); };
  var gradientId = opts.gradientId || (containerId + '-fill');

  var W = 640, H = 220, PAD_X = 8, PAD_TOP = 40, PAD_BOTTOM = 8;
  var values = dados.map(function (d) { return Number(d.valor) || 0; });
  var max = Math.max.apply(null, values.concat([1]));
  var innerW = W - PAD_X * 2;
  var innerH = H - PAD_TOP - PAD_BOTTOM;
  var stepX = dados.length > 1 ? innerW / (dados.length - 1) : 0;
  var baseline = PAD_TOP + innerH;

  var points = values.map(function (v, i) {
    return { x: PAD_X + stepX * i, y: baseline - (v / max) * innerH, v: v };
  });

  var linePath = 'M ' + points[0].x + ' ' + points[0].y;
  for (var i = 0; i < points.length - 1; i++) {
    var p0 = points[i], p1 = points[i + 1];
    var midX = (p0.x + p1.x) / 2;
    linePath += ' C ' + midX + ' ' + p0.y + ', ' + midX + ' ' + p1.y + ', ' + p1.x + ' ' + p1.y;
  }
  var last = points[points.length - 1];
  var areaPath = linePath + ' L ' + last.x + ' ' + baseline + ' L ' + points[0].x + ' ' + baseline + ' Z';

  var ultimo = dados[dados.length - 1];

  el.innerHTML =
    '<div class="line-chart-wrap">' +
      '<div class="line-chart-badge"><span>' + ultimo.label + '</span><strong>' + format(ultimo.valor) + '</strong></div>' +
      '<svg class="line-chart" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none">' +
        '<defs>' +
          '<linearGradient id="' + gradientId + '" x1="0" y1="0" x2="0" y2="1">' +
            '<stop offset="0%" stop-color="var(--color-primary)" stop-opacity="0.38" />' +
            '<stop offset="100%" stop-color="var(--color-primary)" stop-opacity="0" />' +
          '</linearGradient>' +
          '<linearGradient id="' + gradientId + '-stroke" x1="0" y1="0" x2="1" y2="0">' +
            '<stop offset="0%" stop-color="var(--color-primary)" />' +
            '<stop offset="55%" stop-color="var(--color-coral)" />' +
            '<stop offset="100%" stop-color="var(--color-wine)" />' +
          '</linearGradient>' +
        '</defs>' +
        '<line class="line-chart-guide" x1="' + last.x + '" y1="4" x2="' + last.x + '" y2="' + last.y + '" />' +
        '<path class="line-chart-area" style="fill:url(#' + gradientId + ')" d="' + areaPath + '"></path>' +
        '<path class="line-chart-line" style="stroke:url(#' + gradientId + '-stroke)" d="' + linePath + '"></path>' +
        points.map(function (p, i) {
          return '<circle class="line-chart-dot' + (i === points.length - 1 ? ' last' : '') + '" cx="' + p.x + '" cy="' + p.y + '" r="5">' +
            '<title>' + dados[i].label + ': ' + format(p.v) + '</title></circle>';
        }).join('') +
      '</svg>' +
      '<div class="line-chart-labels">' + dados.map(function (d) { return '<span>' + d.label + '</span>'; }).join('') + '</div>' +
    '</div>';

  var lineEl = el.querySelector('.line-chart-line');
  var areaEl = el.querySelector('.line-chart-area');
  if (REDUCE_MOTION) return;
  var len = lineEl.getTotalLength();
  lineEl.style.strokeDasharray = len;
  lineEl.style.strokeDashoffset = len;
  areaEl.style.opacity = '0';
  requestAnimationFrame(function () {
    setTimeout(function () {
      lineEl.style.transition = 'stroke-dashoffset 1.1s cubic-bezier(.16,1,.3,1)';
      lineEl.style.strokeDashoffset = '0';
      areaEl.style.transition = 'opacity 0.9s ease 0.35s';
      areaEl.style.opacity = '1';
    }, 50);
  });
}

/* ===== Banner de bloqueio por matrícula suspensa ===== */
function renderBloqueioBanner(containerId, dados) {
  var el = document.getElementById(containerId);
  if (!el) return;

  if (dados.matricula_status !== 'suspensa') {
    el.innerHTML = '';
    return;
  }

  el.innerHTML =
    '<div class="bloqueio-banner" data-reveal>' +
      '<span class="bloqueio-banner-icon">' + Icons.icon('alert-triangle', { size: 20 }) + '</span>' +
      '<div>' +
        '<strong>Sua matrícula está com pagamento pendente.</strong>' +
        '<span>Vencida desde ' + formatData(dados.data_vencimento) + '. Regularize pelo link enviado no WhatsApp ou na recepção para voltar a acessar treinos, aulas e ranking.</span>' +
      '</div>' +
    '</div>';
  initReveal();
}

/* ===== Toggle mostrar/ocultar senha (telas de auth) ===== */
function initPasswordToggles() {
  document.querySelectorAll('[data-toggle-password]').forEach(function (btn) {
    if (btn.dataset.toggleWired) return;
    btn.dataset.toggleWired = '1';
    btn.addEventListener('click', function () {
      var input = document.getElementById(btn.dataset.togglePassword);
      if (!input) return;
      var showing = input.type === 'text';
      input.type = showing ? 'password' : 'text';
      btn.innerHTML = Icons.icon(showing ? 'eye' : 'eye-off', { size: 17 });
      btn.setAttribute('aria-label', showing ? 'Mostrar senha' : 'Ocultar senha');
    });
  });
}

document.addEventListener('DOMContentLoaded', function () {
  initReveal();
  initRipple();
  initPasswordToggles();
});
