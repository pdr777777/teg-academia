// Mobile menu
document.getElementById('btn-mobile-menu').innerHTML = Icons.icon('menu', { size: 20 });

// ===== PrismaticBurst — WebGL2 =====
(function () {
  const canvas = document.querySelector('.hero-burst-canvas');
  if (!canvas) return;

  const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, powerPreference: 'high-performance' });
  if (!gl) return;

  const VERT = `#version 300 es
in vec2 position;
in vec2 uv;
out vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position, 0.0, 1.0); }`;

  const FRAG = `#version 300 es
precision highp float;
precision highp int;
out vec4 fragColor;
uniform vec2  uResolution;
uniform float uTime;
uniform float uIntensity;
uniform float uSpeed;
uniform int   uAnimType;
uniform vec2  uMouse;
uniform int   uColorCount;
uniform float uDistort;
uniform vec2  uOffset;
uniform sampler2D uGradient;
uniform float uNoiseAmount;
uniform int   uRayCount;

float hash21(vec2 p){
  p=floor(p);float f=52.9829189*fract(dot(p,vec2(0.065,0.005)));return fract(f);
}
mat2 rot30(){ return mat2(0.8,-0.5,0.5,0.8); }
float layeredNoise(vec2 fragPx){
  vec2 p=mod(fragPx+vec2(uTime*30.,-uTime*21.),1024.);
  vec2 q=rot30()*p;float n=0.;
  n+=.40*hash21(q);n+=.25*hash21(q*2.+17.);
  n+=.20*hash21(q*4.+47.);n+=.10*hash21(q*8.+113.);
  n+=.05*hash21(q*16.+191.);return n;
}
vec3 rayDir(vec2 frag,vec2 res,vec2 off,float dist){
  float focal=res.y*max(dist,1e-3);
  return normalize(vec3(2.*(frag-off)-res,focal));
}
float edgeFade(vec2 frag,vec2 res,vec2 off){
  vec2 toC=frag-.5*res-off;
  float r=length(toC)/(.5*min(res.x,res.y));
  float x=clamp(r,0.,1.);
  float q=x*x*x*(x*(x*6.-15.)+10.);
  float s=q*.5;s=pow(s,1.5);
  float tail=1.-pow(1.-s,2.);s=mix(s,tail,.2);
  float dn=(layeredNoise(frag*.15)-.5)*.0015*s;
  return clamp(s+dn,0.,1.);
}
mat3 rotX(float a){float c=cos(a),s=sin(a);return mat3(1,0,0,0,c,-s,0,s,c);}
mat3 rotY(float a){float c=cos(a),s=sin(a);return mat3(c,0,s,0,1,0,-s,0,c);}
mat3 rotZ(float a){float c=cos(a),s=sin(a);return mat3(c,-s,0,s,c,0,0,0,1);}
vec3 sampleGradient(float t){
  return texture(uGradient,vec2(clamp(t,0.,1.),.5)).rgb;
}
vec2 rot2(vec2 v,float a){float s=sin(a),c=cos(a);return mat2(c,-s,s,c)*v;}
float bendAngle(vec3 q,float t){
  return .8*sin(q.x*.55+t*.6)+.7*sin(q.y*.50-t*.5)+.6*sin(q.z*.60+t*.7);
}
void main(){
  vec2 frag=gl_FragCoord.xy;
  float t=uTime*uSpeed;
  float jitterAmp=.1*clamp(uNoiseAmount,0.,1.);
  vec3 dir=rayDir(frag,uResolution,uOffset,1.);
  float marchT=0.;vec3 col=vec3(0.);
  float n=layeredNoise(frag);
  vec4 cv=cos(t*.2+vec4(0.,33.,11.,0.));
  mat2 M2=mat2(cv.x,cv.y,cv.z,cv.w);
  float amp=clamp(uDistort,0.,50.)*.15;
  mat3 rot3dMat=mat3(1.);
  if(uAnimType==1){
    vec3 ang=vec3(t*.31,t*.21,t*.17);
    rot3dMat=rotZ(ang.z)*rotY(ang.y)*rotX(ang.x);
  }
  mat3 hoverMat=mat3(1.);
  if(uAnimType==2){
    vec2 m=uMouse*2.-1.;
    vec3 ang=vec3(m.y*.6,m.x*.6,0.);
    hoverMat=rotY(ang.y)*rotX(ang.x);
  }
  for(int i=0;i<44;++i){
    vec3 P=marchT*dir;P.z-=2.;
    float rad=length(P);
    vec3 Pl=P*(10./max(rad,1e-6));
    if(uAnimType==0){ Pl.xz*=M2; }
    else if(uAnimType==1){ Pl=rot3dMat*Pl; }
    else { Pl=hoverMat*Pl; }
    float stepLen=min(rad-.3,n*jitterAmp)+.1;
    float grow=smoothstep(.35,3.,marchT);
    float a1=amp*grow*bendAngle(Pl*.6,t);
    float a2=.5*amp*grow*bendAngle(Pl.zyx*.5+3.1,t*.9);
    vec3 Pb=Pl;
    Pb.xz=rot2(Pb.xz,a1);Pb.xy=rot2(Pb.xy,a2);
    float rayPattern=smoothstep(.5,.7,
      sin(Pb.x+cos(Pb.y)*cos(Pb.z))*sin(Pb.z+sin(Pb.y)*cos(Pb.x+t)));
    if(uRayCount>0){
      float ang2=atan(Pb.y,Pb.x);
      float comb=.5+.5*cos(float(uRayCount)*ang2);
      comb=pow(comb,3.);
      rayPattern*=smoothstep(.15,.95,comb);
    }
    vec3 spectralDefault=1.+vec3(cos(marchT*3.),cos(marchT*3.+1.),cos(marchT*3.+2.));
    float saw=fract(marchT*.25);float tRay=saw*saw*(3.-2.*saw);
    vec3 userGradient=2.*sampleGradient(tRay);
    vec3 spectral=(uColorCount>0)?userGradient:spectralDefault;
    vec3 base=(.05/(.4+stepLen))*smoothstep(5.,0.,rad)*spectral;
    col+=base*rayPattern;marchT+=stepLen;
  }
  col*=edgeFade(frag,uResolution,uOffset)*uIntensity;
  fragColor=vec4(clamp(col,0.,1.),1.);
}`;

  function compile(type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.error(gl.getShaderInfoLog(s)); return null; }
    return s;
  }
  const vert = compile(gl.VERTEX_SHADER, VERT);
  const frag = compile(gl.FRAGMENT_SHADER, FRAG);
  if (!vert || !frag) return;

  const prog = gl.createProgram();
  gl.attachShader(prog, vert); gl.attachShader(prog, frag); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { console.error(gl.getProgramInfoLog(prog)); return; }
  gl.useProgram(prog);

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  function buf(data, name, size) {
    const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, name);
    if (loc >= 0) { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, 0, 0); }
  }
  buf(new Float32Array([-1,-1, 3,-1, -1,3]), 'position', 2);
  buf(new Float32Array([ 0, 0, 2, 0,  0,2]), 'uv', 2);

  const U = {};
  ['uResolution','uTime','uIntensity','uSpeed','uAnimType','uMouse',
   'uColorCount','uDistort','uOffset','uGradient','uNoiseAmount','uRayCount']
    .forEach(n => U[n] = gl.getUniformLocation(prog, n));

  // Gradient: vermelho → laranja → vermelho escuro
  const HEX = ['#cc0000','#ff5500','#ff8a00','#cc0000'];
  const cData = new Uint8Array(HEX.length * 4);
  HEX.forEach((h, i) => {
    const v = parseInt(h.slice(1), 16);
    cData[i*4]=(v>>16)&255; cData[i*4+1]=(v>>8)&255; cData[i*4+2]=v&255; cData[i*4+3]=255;
  });
  const gradTex = gl.createTexture();
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, gradTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, HEX.length, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, cData);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  gl.uniform1f(U.uIntensity, 2.2);  gl.uniform1f(U.uSpeed, 0.45);
  gl.uniform1i(U.uAnimType, 1);     gl.uniform2f(U.uMouse, 0.5, 0.5);
  gl.uniform1i(U.uColorCount, HEX.length); gl.uniform1f(U.uDistort, 0.0);
  gl.uniform2f(U.uOffset, 0.0, 0.0); gl.uniform1i(U.uGradient, 0);
  gl.uniform1f(U.uNoiseAmount, 0.8); gl.uniform1i(U.uRayCount, 0);

  const DPR = Math.min(window.devicePixelRatio || 1, 2);
  function resize() {
    canvas.width  = canvas.offsetWidth  * DPR;
    canvas.height = canvas.offsetHeight * DPR;
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(U.uResolution, canvas.width, canvas.height);
  }
  new ResizeObserver(resize).observe(canvas.parentElement);
  resize();

  const t0 = performance.now();
  (function render() {
    gl.uniform1f(U.uTime, (performance.now() - t0) * 0.001);
    gl.bindVertexArray(vao);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    requestAnimationFrame(render);
  })();
})();

// ===== Stat alunos =====
document.getElementById('stat-alunos').textContent = '500+';

// ===== Modalidades =====
const MODALIDADES = [
  { icon: 'dumbbell',   titulo: 'Musculação',      desc: 'Equipamentos de última geração, renovados anualmente para o melhor desempenho.' },
  { icon: 'flame',      titulo: 'Cross Training',  desc: 'Espaço funcional completo para treinos de alta intensidade e superação.' },
  { icon: 'users',      titulo: 'Aulas Coletivas', desc: 'Spinning, jump, dança e muito mais — grade variada todos os dias.' },
  { icon: 'activity',   titulo: 'Funcional',        desc: 'Treinamento funcional para força, mobilidade e equilíbrio corporal.' },
  { icon: 'zap',        titulo: 'HIIT',             desc: 'Alta intensidade para maximizar resultados em menos tempo de treino.' },
  { icon: 'heart',      titulo: 'Yoga',             desc: 'Flexibilidade, equilíbrio e bem-estar para corpo e mente.' },
  { icon: 'music',      titulo: 'Dança',            desc: 'Zumba e aulas de dança para treinar com alegria e motivação.' },
  { icon: 'user-check', titulo: 'Personal',         desc: 'Acompanhamento individual com protocolo personalizado para você.' },
];

document.getElementById('modalidades-grid').innerHTML = MODALIDADES.map((m) => `
  <div class="modalidade-card reveal">
    <div class="modalidade-icon">${Icons.icon(m.icon, { size: 22 })}</div>
    <h3>${m.titulo}</h3>
    <p>${m.desc}</p>
    <button class="btn-modalidade">Ver mais ${Icons.icon('arrow-right', { size: 11 })}</button>
  </div>
`).join('');

// ===== Depoimentos =====
const DEPOIMENTOS = [
  { nome: 'Marina Souza',   tag: 'Aluna há 2 anos',  texto: 'Troquei de academia e não me arrependo. O acompanhamento dos professores faz toda diferença.' },
  { nome: 'Rafael Torres',  tag: 'Aluno há 8 meses', texto: 'A área do aluno com XP e sequência me motiva a nunca faltar. Melhor academia que já treinei.' },
  { nome: 'Camila Duarte',  tag: 'Aluna há 1 ano',   texto: 'Estrutura excelente, ambiente limpo e horários que cabem na minha rotina.' },
];

function iniciais(nome) {
  return nome.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase();
}

document.getElementById('depoimentos-grid').innerHTML = DEPOIMENTOS.map((d) => `
  <div class="card depoimento-card reveal">
    <div class="stars">${Icons.icon('star', { size: 14 }).repeat(5)}</div>
    <p>&ldquo;${d.texto}&rdquo;</p>
    <div class="depoimento-autor">
      <span class="avatar-fallback">${iniciais(d.nome)}</span>
      <div><strong>${d.nome}</strong><span>${d.tag}</span></div>
    </div>
  </div>
`).join('');

// ===== Horários =====
async function carregarHorarios() {
  const tbody = document.querySelector('#tabela-horarios tbody');
  try {
    const grade = await api.get('/api/aulas');
    const linhas = [];
    grade.forEach((dia) => {
      dia.aulas.forEach((aula) => {
        linhas.push(`
          <tr>
            <td>${dia.dia}</td>
            <td>${aula.nome}</td>
            <td>${aula.hora_inicio?.slice(0, 5)} – ${aula.hora_fim?.slice(0, 5)}</td>
            <td>${aula.professor_nome || '—'}</td>
          </tr>
        `);
      });
    });
    tbody.innerHTML = linhas.length
      ? linhas.join('')
      : '<tr><td colspan="4" class="empty-state">Grade de horários em breve.</td></tr>';
  } catch {
    tbody.innerHTML = '<tr><td colspan="4" class="empty-state">Não foi possível carregar os horários agora.</td></tr>';
  }
}
carregarHorarios();

// ===== FAQ =====
const FAQS = [
  { q: 'Como funciona a matrícula?', a: 'A matrícula é 100% online. Escolha seu plano, clique em "Começar agora" e você será redirecionado para o WhatsApp para finalizar com nossa equipe. Rápido, sem burocracia.' },
  { q: 'Tem taxa de matrícula?', a: 'Não. Na TEG não cobramos taxa de matrícula nem taxas escondidas. Você paga apenas o valor do plano escolhido.' },
  { q: 'Posso cancelar quando quiser?', a: 'Nos planos mensais, sim — basta avisar com 5 dias de antecedência. Nos planos trimestrais e anuais, o cancelamento antecipado pode implicar em multa proporcional.' },
  { q: 'Quais modalidades estão incluídas no plano?', a: 'Todos os planos incluem acesso completo a todas as modalidades disponíveis: musculação, cross training, aulas coletivas (spinning, jump, yoga, dança), funcional e HIIT.' },
  { q: 'Qual é o horário de funcionamento?', a: 'A TEG funciona de segunda a domingo, das 06h às 23h. Confira a grade de aulas coletivas na seção de horários.' },
  { q: 'O que é a área do aluno?', a: 'É a plataforma digital exclusiva para alunos TEG. Lá você registra treinos, acumula XP, acompanha sua sequência diária e compete no ranking mensal com outros alunos.' },
];

document.getElementById('faq-list').innerHTML = FAQS.map((f) => `
  <div class="faq-item">
    <button class="faq-trigger" aria-expanded="false">
      <span>${f.q}</span>
      <span class="faq-arrow">${Icons.icon('chevron-down', { size: 18 })}</span>
    </button>
    <div class="faq-body"><p>${f.a}</p></div>
  </div>
`).join('');

document.querySelectorAll('.faq-trigger').forEach((btn) => {
  btn.addEventListener('click', () => {
    const item = btn.closest('.faq-item');
    const isOpen = item.classList.contains('open');
    document.querySelectorAll('.faq-item.open').forEach((el) => {
      el.classList.remove('open');
      el.querySelector('.faq-trigger').setAttribute('aria-expanded', 'false');
    });
    if (!isOpen) {
      item.classList.add('open');
      btn.setAttribute('aria-expanded', 'true');
    }
  });
});

// ===== Plan buttons → WhatsApp =====
const WA = 'https://wa.me/5567993009296?text=';
const PLAN_MSGS = [
  'Olá!+Tenho+interesse+no+plano+Mensal+da+Academia+TEG+(R%24119%2C90%2Fmês+no+Pix).+Pode+me+ajudar+a+finalizar+minha+matrícula%3F',
  'Olá!+Tenho+interesse+no+plano+Trimestral+da+Academia+TEG+(3x+R%24109%2C90).+Pode+me+ajudar+a+finalizar+minha+matrícula%3F',
  'Olá!+Tenho+interesse+no+plano+Anual+da+Academia+TEG+(12x+R%24099%2C90+no+Pix+recorrente).+Pode+me+ajudar+a+finalizar+minha+matrícula%3F',
];

document.querySelectorAll('.plan-card').forEach((card, i) => {
  const btn = card.querySelector('.btn');
  if (btn && PLAN_MSGS[i]) {
    btn.href   = WA + PLAN_MSGS[i];
    btn.target = '_blank';
    btn.rel    = 'noopener';
  }
});

// ===== Electric Border =====
(function initElectricBorder() {
  const card = document.querySelector('.plan-card.plan-featured');
  if (!card) return;

  const canvas = document.createElement('canvas');
  canvas.className = 'plan-electric-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  card.prepend(canvas);

  const ctx    = canvas.getContext('2d');
  const PAD    = 12;  // deve bater com inset: -12px no CSS
  const BR     = 20;  // border-radius
  const COLOR  = '#a90000';
  const SPEED  = 1.2;
  const CHAOS  = 0.16;
  const THICK  = 2;
  const CHAOS_PX = CHAOS * 40; // ~6.4 px de desvio máximo

  function resize() {
    canvas.width  = card.offsetWidth  + PAD * 2;
    canvas.height = card.offsetHeight + PAD * 2;
  }
  resize();
  new ResizeObserver(resize).observe(card);

  // Perímetro: retorna array de {x, y, nx, ny} com normais outward
  function perimeter(W, H, r, N) {
    const segs = [
      { len: W-2*r, fn: t => [PAD+r+t*(W-2*r), PAD,     0, -1] },
      { len: r*Math.PI/2, fn: t => { const a=-Math.PI/2+t*Math.PI/2; return [PAD+W-r+Math.cos(a)*r, PAD+r+Math.sin(a)*r, Math.cos(a), Math.sin(a)]; }},
      { len: H-2*r, fn: t => [PAD+W,   PAD+r+t*(H-2*r),  1,  0] },
      { len: r*Math.PI/2, fn: t => { const a=t*Math.PI/2;             return [PAD+W-r+Math.cos(a)*r, PAD+H-r+Math.sin(a)*r, Math.cos(a), Math.sin(a)]; }},
      { len: W-2*r, fn: t => [PAD+W-r-t*(W-2*r), PAD+H,  0,  1] },
      { len: r*Math.PI/2, fn: t => { const a=Math.PI/2+t*Math.PI/2;  return [PAD+r+Math.cos(a)*r, PAD+H-r+Math.sin(a)*r, Math.cos(a), Math.sin(a)]; }},
      { len: H-2*r, fn: t => [PAD,   PAD+H-r-t*(H-2*r), -1,  0] },
      { len: r*Math.PI/2, fn: t => { const a=Math.PI+t*Math.PI/2;    return [PAD+r+Math.cos(a)*r, PAD+r+Math.sin(a)*r, Math.cos(a), Math.sin(a)]; }},
    ];
    const total = segs.reduce((s, g) => s + g.len, 0);
    const pts = [];
    for (const seg of segs) {
      const cnt = Math.max(3, Math.round(N * seg.len / total));
      for (let i = 0; i < cnt; i++) pts.push(seg.fn(i / cnt));
    }
    return pts;
  }

  // Onda triangular — dá ângulos nítidos (relâmpago), não curvas suaves
  function triWave(t) {
    return 2 * Math.abs(t - Math.floor(t + 0.5));
  }

  // Noise angular: combinação de triangle waves em frequências primas
  function lightning(t, ph) {
    return (
      (triWave(t * 7.3  + ph * 0.9)  - 0.5) * 0.55 +
      (triWave(t * 19.7 + ph * 1.4)  - 0.5) * 0.30 +
      (triWave(t * 43.1 + ph * 2.1)  - 0.5) * 0.15
    );
  }

  let phase = 0;

  function frame() {
    const cw = canvas.width, ch = canvas.height;
    ctx.clearRect(0, 0, cw, ch);

    const pts = perimeter(cw - PAD*2, ch - PAD*2, BR, 240);
    const N   = pts.length;

    // Desloca cada ponto na direção da normal (perpendicular à borda)
    const disp = pts.map(([x, y, nx, ny], i) => {
      const t = i / N;
      const d = lightning(t, phase) * CHAOS_PX;
      return [x + nx * d, y + ny * d];
    });

    const drawPass = (lw, blur, alpha) => {
      ctx.beginPath();
      ctx.moveTo(disp[0][0], disp[0][1]);
      for (let i = 1; i < N; i++) ctx.lineTo(disp[i][0], disp[i][1]);
      ctx.closePath();
      ctx.strokeStyle = COLOR;
      ctx.lineWidth   = lw;
      ctx.shadowColor = COLOR;
      ctx.shadowBlur  = blur;
      ctx.globalAlpha = alpha;
      ctx.stroke();
    };

    drawPass(12, 60, 0.08);                              // halo externo
    drawPass(4,  30, 0.22);                              // glow médio
    drawPass(THICK, 12, 0.85 + Math.sin(phase*3)*0.1);  // linha core

    ctx.shadowBlur  = 0;
    ctx.globalAlpha = 1;
    phase += 0.014 * SPEED;
    requestAnimationFrame(frame);
  }

  frame();
})();

// ===== Lead form =====
document.getElementById('form-lead').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const form = ev.target;
  const btn  = form.querySelector('button[type="submit"]');
  const params = new URLSearchParams(window.location.search);

  btn.disabled    = true;
  btn.textContent = 'Enviando...';
  try {
    await api.post('/api/leads', {
      nome:     form.nome.value,
      telefone: form.telefone.value,
      objetivo: form.objetivo.value,
      origem:   'site',
      ref:      params.get('ref') || undefined,
    });
    toast('Recebemos seus dados! Em breve entraremos em contato.', 'success');
    form.reset();
  } catch (err) {
    toast(err.message || 'Erro ao enviar. Tente novamente.', 'error');
  } finally {
    btn.disabled    = false;
    btn.textContent = 'Agendar aula grátis';
  }
});

// ===== Scroll reveal =====
const revealObs = new IntersectionObserver(
  (entries) => entries.forEach((e) => {
    if (e.isIntersecting) {
      e.target.classList.add('in-view');
      revealObs.unobserve(e.target);
    }
  }),
  { threshold: 0.07, rootMargin: '0px 0px -40px 0px' }
);

document.querySelectorAll(
  '.modalidade-card, .plan-card, .step-card, .depoimento-card, .gamificacao-copy, .gamificacao-visual, .faq-item'
).forEach((el, i) => {
  if (!el.classList.contains('reveal')) el.classList.add('reveal');
  if (i % 4 === 1) el.classList.add('reveal-delay-1');
  if (i % 4 === 2) el.classList.add('reveal-delay-2');
  if (i % 4 === 3) el.classList.add('reveal-delay-3');
  revealObs.observe(el);
});
