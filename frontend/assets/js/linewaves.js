/* LineWaves — ported from react-bits/DavidHDev to vanilla WebGL2 */
(function () {
  var VERT = [
    'attribute vec2 uv;',
    'attribute vec2 position;',
    'varying vec2 vUv;',
    'void main() {',
    '  vUv = uv;',
    '  gl_Position = vec4(position, 0, 1);',
    '}'
  ].join('\n');

  var FRAG = [
    'precision highp float;',
    'uniform float uTime;',
    'uniform vec3 uResolution;',
    'uniform float uSpeed;',
    'uniform float uInnerLines;',
    'uniform float uOuterLines;',
    'uniform float uWarpIntensity;',
    'uniform float uRotation;',
    'uniform float uEdgeFadeWidth;',
    'uniform float uColorCycleSpeed;',
    'uniform float uBrightness;',
    'uniform vec3 uColor1;',
    'uniform vec3 uColor2;',
    'uniform vec3 uColor3;',
    'uniform vec2 uMouse;',
    'uniform float uMouseInfluence;',
    'uniform bool uEnableMouse;',
    '#define HALF_PI 1.5707963',
    'float hashF(float n) {',
    '  return fract(sin(n * 127.1) * 43758.5453123);',
    '}',
    'float smoothNoise(float x) {',
    '  float i = floor(x);',
    '  float f = fract(x);',
    '  float u = f * f * (3.0 - 2.0 * f);',
    '  return mix(hashF(i), hashF(i + 1.0), u);',
    '}',
    'float displaceA(float coord, float t) {',
    '  float result = sin(coord * 2.123) * 0.2;',
    '  result += sin(coord * 3.234 + t * 4.345) * 0.1;',
    '  result += sin(coord * 0.589 + t * 0.934) * 0.5;',
    '  return result;',
    '}',
    'float displaceB(float coord, float t) {',
    '  float result = sin(coord * 1.345) * 0.3;',
    '  result += sin(coord * 2.734 + t * 3.345) * 0.2;',
    '  result += sin(coord * 0.189 + t * 0.934) * 0.3;',
    '  return result;',
    '}',
    'vec2 rotate2D(vec2 p, float angle) {',
    '  float c = cos(angle);',
    '  float s = sin(angle);',
    '  return vec2(p.x * c - p.y * s, p.x * s + p.y * c);',
    '}',
    'void main() {',
    '  vec2 coords = gl_FragCoord.xy / uResolution.xy;',
    '  coords = coords * 2.0 - 1.0;',
    '  coords = rotate2D(coords, uRotation);',
    '  float halfT = uTime * uSpeed * 0.5;',
    '  float fullT = uTime * uSpeed;',
    '  float mouseWarp = 0.0;',
    '  if (uEnableMouse) {',
    '    vec2 mPos = rotate2D(uMouse * 2.0 - 1.0, uRotation);',
    '    float mDist = length(coords - mPos);',
    '    mouseWarp = uMouseInfluence * exp(-mDist * mDist * 4.0);',
    '  }',
    '  float warpAx = coords.x + displaceA(coords.y, halfT) * uWarpIntensity + mouseWarp;',
    '  float warpAy = coords.y - displaceA(coords.x * cos(fullT) * 1.235, halfT) * uWarpIntensity;',
    '  float warpBx = coords.x + displaceB(coords.y, halfT) * uWarpIntensity + mouseWarp;',
    '  float warpBy = coords.y - displaceB(coords.x * sin(fullT) * 1.235, halfT) * uWarpIntensity;',
    '  vec2 fieldA = vec2(warpAx, warpAy);',
    '  vec2 fieldB = vec2(warpBx, warpBy);',
    '  vec2 blended = mix(fieldA, fieldB, mix(fieldA, fieldB, 0.5));',
    '  float fadeTop    = smoothstep( uEdgeFadeWidth,  uEdgeFadeWidth + 0.4, blended.y);',
    '  float fadeBottom = smoothstep(-uEdgeFadeWidth, -(uEdgeFadeWidth + 0.4), blended.y);',
    '  float vMask = 1.0 - max(fadeTop, fadeBottom);',
    '  float tileCount = mix(uOuterLines, uInnerLines, vMask);',
    '  float scaledY = blended.y * tileCount;',
    '  float nY = smoothNoise(abs(scaledY));',
    '  float ridge = pow(',
    '    step(abs(nY - blended.x) * 2.0, HALF_PI) * cos(2.0 * (nY - blended.x)),',
    '    5.0',
    '  );',
    '  float lines = 0.0;',
    '  for (float i = 1.0; i < 3.0; i += 1.0) {',
    '    lines += pow(max(fract(scaledY), fract(-scaledY)), i * 2.0);',
    '  }',
    '  float pattern = vMask * lines;',
    '  float cycleT = fullT * uColorCycleSpeed;',
    '  float rChannel = (pattern + lines * ridge) * (cos(blended.y + cycleT * 0.234) * 0.5 + 1.0);',
    '  float gChannel = (pattern + vMask  * ridge) * (sin(blended.x + cycleT * 1.745) * 0.5 + 1.0);',
    '  float bChannel = (pattern + lines * ridge) * (cos(blended.x + cycleT * 0.534) * 0.5 + 1.0);',
    '  vec3 col = (rChannel * uColor1 + gChannel * uColor2 + bChannel * uColor3) * uBrightness;',
    '  float alpha = clamp(length(col), 0.0, 1.0);',
    '  gl_FragColor = vec4(col, alpha);',
    '}'
  ].join('\n');

  function hexToRgb(hex) {
    var h = hex.replace('#', '');
    return [
      parseInt(h.slice(0, 2), 16) / 255,
      parseInt(h.slice(2, 4), 16) / 255,
      parseInt(h.slice(4, 6), 16) / 255
    ];
  }

  function compileShader(gl, type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    return s;
  }

  var canvas = document.createElement('canvas');
  canvas.id = 'linewaves-canvas';
  document.body.insertBefore(canvas, document.body.firstChild);

  var gl = canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: false });
  if (!gl) {
    /* Fallback: silently remove canvas, keep dark bg */
    canvas.parentNode.removeChild(canvas);
    return;
  }

  gl.clearColor(0, 0, 0, 0);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  var vs = compileShader(gl, gl.VERTEX_SHADER, VERT);
  var fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAG);
  var prog = gl.createProgram();
  gl.attachShader(prog, vs);
  gl.attachShader(prog, fs);
  gl.linkProgram(prog);
  gl.useProgram(prog);

  /* Full-screen triangle (OGL Triangle equivalent) */
  var vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  var posBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, posBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  var posLoc = gl.getAttribLocation(prog, 'position');
  gl.enableVertexAttribArray(posLoc);
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

  var uvBuf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, uvBuf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 2, 0, 0, 2]), gl.STATIC_DRAW);
  var uvLoc = gl.getAttribLocation(prog, 'uv');
  gl.enableVertexAttribArray(uvLoc);
  gl.vertexAttribPointer(uvLoc, 2, gl.FLOAT, false, 0, 0);

  gl.bindVertexArray(null);

  /* Uniform locations */
  var uTime        = gl.getUniformLocation(prog, 'uTime');
  var uResolution  = gl.getUniformLocation(prog, 'uResolution');
  var uSpeed       = gl.getUniformLocation(prog, 'uSpeed');
  var uInnerLines  = gl.getUniformLocation(prog, 'uInnerLines');
  var uOuterLines  = gl.getUniformLocation(prog, 'uOuterLines');
  var uWarpInt     = gl.getUniformLocation(prog, 'uWarpIntensity');
  var uRotation    = gl.getUniformLocation(prog, 'uRotation');
  var uEdgeFade    = gl.getUniformLocation(prog, 'uEdgeFadeWidth');
  var uCycleSpeed  = gl.getUniformLocation(prog, 'uColorCycleSpeed');
  var uBrightness  = gl.getUniformLocation(prog, 'uBrightness');
  var uColor1      = gl.getUniformLocation(prog, 'uColor1');
  var uColor2      = gl.getUniformLocation(prog, 'uColor2');
  var uColor3      = gl.getUniformLocation(prog, 'uColor3');
  var uMouse       = gl.getUniformLocation(prog, 'uMouse');
  var uMouseInfl   = gl.getUniformLocation(prog, 'uMouseInfluence');
  var uEnableMouse = gl.getUniformLocation(prog, 'uEnableMouse');

  /* Static uniforms — user params */
  gl.uniform1f(uSpeed,       2.2);
  gl.uniform1f(uInnerLines,  32.0);
  gl.uniform1f(uOuterLines,  23.0);
  gl.uniform1f(uWarpInt,     0.12);
  gl.uniform1f(uRotation,    -32.0 * Math.PI / 180.0);
  gl.uniform1f(uEdgeFade,    0.55);
  gl.uniform1f(uCycleSpeed,  1.7);
  gl.uniform1f(uBrightness,  0.14);
  gl.uniform3fv(uColor1,     hexToRgb('#d40000'));
  gl.uniform3fv(uColor2,     hexToRgb('#983e00'));
  gl.uniform3fv(uColor3,     hexToRgb('#dc0000'));
  gl.uniform2f(uMouse,       0.5, 0.5);
  gl.uniform1f(uMouseInfl,   2.0);
  gl.uniform1i(uEnableMouse, 0);

  function resize() {
    var w = window.innerWidth;
    var h = window.innerHeight;
    canvas.width  = w;
    canvas.height = h;
    gl.viewport(0, 0, w, h);
    gl.uniform3f(uResolution, w, h, w / h);
  }
  window.addEventListener('resize', resize);
  resize();

  var raf;
  function frame(t) {
    raf = requestAnimationFrame(frame);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform1f(uTime, t * 0.001);
    gl.bindVertexArray(vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }
  raf = requestAnimationFrame(frame);
})();
