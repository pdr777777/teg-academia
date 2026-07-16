// Lightfall — porte em WebGL puro do componente "Lightfall" do React Bits
// (github.com/DavidHDev/react-bits), shader idêntico ao original (ogl -> vanilla).
(function () {
  const MAX_COLORS = 8;

  function hexToRGB(hex) {
    const c = hex.replace('#', '').padEnd(6, '0');
    return [
      parseInt(c.slice(0, 2), 16) / 255,
      parseInt(c.slice(2, 4), 16) / 255,
      parseInt(c.slice(4, 6), 16) / 255,
    ];
  }

  function prepColors(input) {
    const base = (input && input.length ? input : ['#A6C8FF', '#5227FF', '#FF9FFC']).slice(0, MAX_COLORS);
    const count = base.length;
    const arr = [];
    for (let i = 0; i < MAX_COLORS; i++) arr.push(hexToRGB(base[Math.min(i, base.length - 1)]));
    const avg = [0, 0, 0];
    for (let i = 0; i < count; i++) {
      avg[0] += arr[i][0]; avg[1] += arr[i][1]; avg[2] += arr[i][2];
    }
    avg[0] /= count; avg[1] /= count; avg[2] /= count;
    return { arr, count, avg };
  }

  const VERTEX_SRC = `
attribute vec2 position;
attribute vec2 uv;
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

  const FRAGMENT_SRC = `
precision highp float;

uniform vec3  iResolution;
uniform vec2  iMouse;
uniform float iTime;

uniform vec3  uColor0;
uniform vec3  uColor1;
uniform vec3  uColor2;
uniform vec3  uColor3;
uniform vec3  uColor4;
uniform vec3  uColor5;
uniform vec3  uColor6;
uniform vec3  uColor7;
uniform int   uColorCount;

uniform vec3  uBgColor;
uniform vec3  uMouseColor;
uniform float uSpeed;
uniform int   uStreakCount;
uniform float uStreakWidth;
uniform float uStreakLength;
uniform float uGlow;
uniform float uDensity;
uniform float uTwinkle;
uniform float uZoom;
uniform float uBgGlow;
uniform float uOpacity;
uniform float uMouseEnabled;
uniform float uMouseStrength;
uniform float uMouseRadius;

varying vec2 vUv;

vec3 palette(float h) {
  int count = uColorCount;
  if (count < 1) count = 1;
  int idx = int(floor(clamp(h, 0.0, 0.999999) * float(count)));
  if (idx <= 0) return uColor0;
  if (idx == 1) return uColor1;
  if (idx == 2) return uColor2;
  if (idx == 3) return uColor3;
  if (idx == 4) return uColor4;
  if (idx == 5) return uColor5;
  if (idx == 6) return uColor6;
  return uColor7;
}

vec3 tanhv(vec3 x) {
  vec3 e = exp(-2.0 * x);
  return (1.0 - e) / (1.0 + e);
}

vec2 sceneC(vec2 frag, vec2 r) {
  vec2 P = (frag + frag - r) / r.x;
  float z = 0.0;
  float d = 1e3;
  vec4 O = vec4(0.0);
  for (int k = 0; k < 28; k++) {
    if (d <= 1e-4) break;
    O = z * normalize(vec4(P, uZoom, 0.0)) - vec4(0.0, 4.0, 1.0, 0.0) / 4.5;
    d = 1.0 - sqrt(length(O * O));
    z += d;
  }
  return vec2(O.x, atan(O.z, O.y));
}

void mainImage(out vec4 o, vec2 C) {
  vec2 r = iResolution.xy;
  vec2 uv0 = (C + C - r) / r.x;
  float T = 0.1 * iTime * uSpeed + 9.0;
  float angRings = max(1.0, floor(6.28318530718 * max(uDensity, 0.05) + 0.5));
  vec2 Y = vec2(5e-3, 6.28318530718 / angRings);

  vec2 c0 = sceneC(C, r);
  vec2 cdx = sceneC(C + vec2(1.0, 0.0), r);
  vec2 cdy = sceneC(C + vec2(0.0, 1.0), r);
  vec2 dCx = cdx - c0;
  vec2 dCy = cdy - c0;
  dCx.y -= 6.28318530718 * floor(dCx.y / 6.28318530718 + 0.5);
  dCy.y -= 6.28318530718 * floor(dCy.y / 6.28318530718 + 0.5);
  vec2 fw = abs(dCx) + abs(dCy);
  C = c0;

  vec2 P = vec2(2.0, 1.0) * uv0 - (r / r.x) * vec2(0.0, 1.0);
  vec4 O = vec4(uBgColor * 90.0 * uBgGlow / (1e3 * dot(P, P) + 6.0), 0.0);

  float mGlow = 0.0;
  if (uMouseEnabled > 0.5) {
    vec2 mN = (iMouse + iMouse - r) / r.x;
    float md = length(uv0 - mN);
    mGlow = exp(-md * md / max(uMouseRadius * uMouseRadius, 1e-4)) * uMouseStrength;
    O.rgb += uMouseColor * mGlow * 0.25;
  }

  float zr = 5e-4 * uStreakWidth;
  vec2 rr = vec2(max(length(fw), 1e-5));
  float tail = 19.0 / max(uStreakLength, 0.05);

  for (int m = 0; m < 16; m++) {
    if (m >= uStreakCount) break;
    float jf = float(m) + 1.0;
    float ic = fract(sin(dot(vec2(jf, floor(C.x / Y.x + 0.5)), vec2(7.0, 11.0)) * 73.0));
    vec2 Pp = C - (T + T * ic) * vec2(0.0, 1.0);
    Pp -= floor(Pp / Y + 0.5) * Y;
    float h = fract(8663.0 * ic);
    vec3 col = palette(h);
    float weight = mix(1.5, 1.0 + sin(T + 7.0 * h + 4.0), uTwinkle);
    weight *= (1.0 + mGlow * 2.0);
    vec2 inner = vec2(length(max(Pp, vec2(-1.0, 0.0))), length(Pp) - zr) - zr;
    vec2 sm = vec2(1.0) - smoothstep(-rr, rr, inner);
    O.rgb += dot(sm, vec2(exp(tail * Pp.y), 3.0)) * col * weight;
    C.x += Y.x / 8.0;
  }

  vec3 colr = sqrt(tanhv(max(O.rgb * uGlow - vec3(0.04, 0.08, 0.02), 0.0)));
  o = vec4(colr, uOpacity);
}

void main() {
  vec4 color;
  mainImage(color, vUv * iResolution.xy);
  gl_FragColor = color;
}
`;

  function compileShader(gl, type, src) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('[Lightfall] erro ao compilar shader:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  function initLightfall(container, opts) {
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      return; // respeita preferência de movimento reduzido — mantém só o fundo estático
    }

    // Teto de 1.5x (não 2x) — o shader é caro por pixel (raymarching), e a maioria dos
    // celulares tem DPR 2.5-3, então isso corta bastante trabalho de GPU sem perda visível
    // num fundo desfocado/animado.
    const dpr = Math.min(opts.dpr || window.devicePixelRatio || 1, 1.5);
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl', { alpha: true, antialias: true })
      || canvas.getContext('experimental-webgl', { alpha: true, antialias: true });
    if (!gl) return;

    container.appendChild(canvas);

    const vertexShader = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SRC);
    const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SRC);
    if (!vertexShader || !fragmentShader) return;

    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error('[Lightfall] erro ao linkar programa:', gl.getProgramInfoLog(program));
      return;
    }
    gl.useProgram(program);

    // Triângulo único cobrindo a tela toda (evita costura nas bordas)
    const positions = new Float32Array([-1, -1, 3, -1, -1, 3]);
    const uvs = new Float32Array([0, 0, 2, 0, 0, 2]);

    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
    const positionLoc = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(positionLoc);
    gl.vertexAttribPointer(positionLoc, 2, gl.FLOAT, false, 0, 0);

    const uvBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, uvs, gl.STATIC_DRAW);
    const uvLoc = gl.getAttribLocation(program, 'uv');
    gl.enableVertexAttribArray(uvLoc);
    gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, 0, 0);

    const { arr, count } = prepColors(opts.colors);
    const bgColor = hexToRGB(opts.backgroundColor || '#000000');

    const u = {};
    ['uColor0', 'uColor1', 'uColor2', 'uColor3', 'uColor4', 'uColor5', 'uColor6', 'uColor7'].forEach((name, i) => {
      u[name] = gl.getUniformLocation(program, name);
      gl.uniform3fv(u[name], arr[i]);
    });
    u.uColorCount = gl.getUniformLocation(program, 'uColorCount'); gl.uniform1i(u.uColorCount, count);
    u.uBgColor = gl.getUniformLocation(program, 'uBgColor'); gl.uniform3fv(u.uBgColor, bgColor);
    u.uMouseColor = gl.getUniformLocation(program, 'uMouseColor'); gl.uniform3fv(u.uMouseColor, arr[0]);
    u.uSpeed = gl.getUniformLocation(program, 'uSpeed'); gl.uniform1f(u.uSpeed, opts.speed ?? 0.5);
    u.uStreakCount = gl.getUniformLocation(program, 'uStreakCount'); gl.uniform1i(u.uStreakCount, Math.max(1, Math.min(16, Math.round(opts.streakCount ?? 2))));
    u.uStreakWidth = gl.getUniformLocation(program, 'uStreakWidth'); gl.uniform1f(u.uStreakWidth, opts.streakWidth ?? 1);
    u.uStreakLength = gl.getUniformLocation(program, 'uStreakLength'); gl.uniform1f(u.uStreakLength, opts.streakLength ?? 1);
    u.uGlow = gl.getUniformLocation(program, 'uGlow'); gl.uniform1f(u.uGlow, opts.glow ?? 1);
    u.uDensity = gl.getUniformLocation(program, 'uDensity'); gl.uniform1f(u.uDensity, opts.density ?? 0.6);
    u.uTwinkle = gl.getUniformLocation(program, 'uTwinkle'); gl.uniform1f(u.uTwinkle, opts.twinkle ?? 1);
    u.uZoom = gl.getUniformLocation(program, 'uZoom'); gl.uniform1f(u.uZoom, opts.zoom ?? 3);
    u.uBgGlow = gl.getUniformLocation(program, 'uBgGlow'); gl.uniform1f(u.uBgGlow, opts.backgroundGlow ?? 0.5);
    u.uOpacity = gl.getUniformLocation(program, 'uOpacity'); gl.uniform1f(u.uOpacity, opts.opacity ?? 1);
    u.uMouseEnabled = gl.getUniformLocation(program, 'uMouseEnabled'); gl.uniform1f(u.uMouseEnabled, opts.mouseInteraction ? 1 : 0);
    u.uMouseStrength = gl.getUniformLocation(program, 'uMouseStrength'); gl.uniform1f(u.uMouseStrength, opts.mouseStrength ?? 0.5);
    u.uMouseRadius = gl.getUniformLocation(program, 'uMouseRadius'); gl.uniform1f(u.uMouseRadius, opts.mouseRadius ?? 1);

    u.iResolution = gl.getUniformLocation(program, 'iResolution');
    u.iMouse = gl.getUniformLocation(program, 'iMouse');
    u.iTime = gl.getUniformLocation(program, 'iTime');

    let mouseX = 0, mouseY = 0;
    let width = 0, height = 0;

    function resize() {
      const rect = container.getBoundingClientRect();
      width = Math.max(1, Math.round(rect.width * dpr));
      height = Math.max(1, Math.round(rect.height * dpr));
      canvas.width = width;
      canvas.height = height;
      gl.viewport(0, 0, width, height);
      gl.uniform3f(u.iResolution, width, height, 1);
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(container);

    if (opts.mouseInteraction) {
      canvas.style.pointerEvents = 'auto';
      canvas.addEventListener('pointermove', (e) => {
        const rect = canvas.getBoundingClientRect();
        mouseX = (e.clientX - rect.left) * dpr;
        mouseY = (height - (e.clientY - rect.top) * dpr);
        gl.uniform2f(u.iMouse, mouseX, mouseY);
      });
    }

    let rafId;
    function loop(t) {
      rafId = requestAnimationFrame(loop);
      gl.uniform1f(u.iTime, t * 0.001);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    rafId = requestAnimationFrame(loop);

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        cancelAnimationFrame(rafId);
      } else {
        rafId = requestAnimationFrame(loop);
      }
    });
  }

  window.initLightfall = initLightfall;
})();
