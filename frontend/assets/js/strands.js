/* Vertical strands — adapted from Zync waves-bg for TEG hero */
(function initStrands() {
  var canvas = document.getElementById('teg-strands');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');

  var cfg = {
    lineColor: 'rgba(200, 30, 0, 0.65)',
    waveSpeedX: 0.018,
    waveSpeedY: 0.022,
    waveAmpX: 55,
    friction: 0.5,
    tension: 0.02,
    maxCursorMove: 8,
    xGap: 5,
    yGap: 12,
  };

  /* Simplex noise 2D (Stefan Gustavson, public domain) */
  function makeNoise2D(seed) {
    var s = (seed >>> 0) || 1;
    function rand() {
      s ^= s << 13; s ^= s >>> 17; s ^= s << 5;
      return ((s >>> 0) % 1000) / 1000;
    }
    var p = new Uint8Array(256);
    for (var i = 0; i < 256; i++) p[i] = i;
    for (var i = 255; i > 0; i--) {
      var j = Math.floor(rand() * (i + 1));
      var tmp = p[i]; p[i] = p[j]; p[j] = tmp;
    }
    var perm = new Uint8Array(512);
    for (var i = 0; i < 512; i++) perm[i] = p[i & 255];
    var grad = [[1,1],[-1,1],[1,-1],[-1,-1],[1,0],[-1,0],[0,1],[0,-1]];
    var F2 = 0.5 * (Math.sqrt(3) - 1), G2 = (3 - Math.sqrt(3)) / 6;
    function corner(gi, x, y) {
      var t = 0.5 - x*x - y*y;
      if (t < 0) return 0;
      t *= t;
      var g = grad[gi];
      return t * t * (g[0]*x + g[1]*y);
    }
    return function noise2D(xin, yin) {
      var s2 = (xin + yin) * F2;
      var ii = Math.floor(xin + s2), jj = Math.floor(yin + s2);
      var t2 = (ii + jj) * G2;
      var x0 = xin - (ii - t2), y0 = yin - (jj - t2);
      var i1, j1;
      if (x0 > y0) { i1 = 1; j1 = 0; } else { i1 = 0; j1 = 1; }
      var x1 = x0 - i1 + G2, y1 = y0 - j1 + G2;
      var x2 = x0 - 1 + 2*G2, y2 = y0 - 1 + 2*G2;
      var ia = ii & 255, ja = jj & 255;
      var gi0 = perm[ia + perm[ja]] % 8;
      var gi1 = perm[ia + i1 + perm[ja + j1]] % 8;
      var gi2 = perm[ia + 1 + perm[ja + 1]] % 8;
      return 70 * (corner(gi0, x0, y0) + corner(gi1, x1, y1) + corner(gi2, x2, y2));
    };
  }

  var noise2D = makeNoise2D(13);
  var FREQ = 0.004;
  var MAX_STRANDS = 120, MAX_PTS = 80;
  var w, h, strands = [];

  function build() {
    w = canvas.offsetWidth;
    h = canvas.offsetHeight;
    canvas.width = w;
    canvas.height = h;
    var xGap = Math.max(cfg.xGap, w / MAX_STRANDS);
    var yGap = Math.max(cfg.yGap, h / MAX_PTS);
    strands = [];
    for (var x = 0; x <= w; x += xGap) {
      var pts = [];
      for (var y = 0; y <= h + yGap; y += yGap) {
        pts.push({ ox: x, oy: y, offX: 0, vx: 0 });
      }
      strands.push(pts);
    }
  }
  build();
  window.addEventListener('resize', build, { passive: true });

  var t0 = performance.now();
  var frameInterval = 1000 / 36;
  var lastDraw = 0, rafId = null;

  function draw(now) {
    rafId = requestAnimationFrame(draw);
    if (now - lastDraw < frameInterval) return;
    lastDraw = now;
    var t = Math.max(0, now - t0) / 1000;
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = cfg.lineColor;
    ctx.lineWidth = 1.0;
    ctx.globalAlpha = 0.55;
    var tx = t * cfg.waveSpeedX * 3;
    var ty = t * cfg.waveSpeedY * 3;
    strands.forEach(function(pts) {
      var drawn = [];
      pts.forEach(function(p) {
        var n = noise2D(p.ox * FREQ + tx, p.oy * FREQ + ty);
        var px = p.ox + n * cfg.waveAmpX;
        p.vx += -p.offX * cfg.tension;
        p.vx *= cfg.friction;
        p.offX = Math.max(-cfg.maxCursorMove, Math.min(cfg.maxCursorMove, p.offX + p.vx));
        px += p.offX;
        drawn.push(px, p.oy);
      });
      ctx.beginPath();
      ctx.moveTo(drawn[0], drawn[1]);
      for (var i = 2; i < drawn.length - 2; i += 2) {
        var xc = (drawn[i] + drawn[i+2]) / 2;
        var yc = (drawn[i+1] + drawn[i+3]) / 2;
        ctx.quadraticCurveTo(drawn[i], drawn[i+1], xc, yc);
      }
      ctx.lineTo(drawn[drawn.length-2], drawn[drawn.length-1]);
      ctx.stroke();
    });
    ctx.globalAlpha = 1;
  }

  rafId = requestAnimationFrame(draw);
  document.addEventListener('visibilitychange', function() {
    if (document.hidden) {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = null;
    } else if (!rafId) {
      lastDraw = 0;
      rafId = requestAnimationFrame(draw);
    }
  });
})();
