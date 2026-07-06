// Page loader dismiss
window.addEventListener('load', function () {
  var loader = document.getElementById('page-loader');
  if (loader) setTimeout(function () { loader.classList.add('hidden'); }, 250);
});

// Mobile menu
document.getElementById('btn-mobile-menu').innerHTML = Icons.icon('menu', { size: 20 });

// ===== Count-up stats =====
function countUp(el, end, suffix, duration) {
  if (!el) return;
  const start = performance.now();
  (function step(now) {
    const t = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - t, 3);
    el.textContent = Math.round(end * eased) + suffix;
    if (t < 1) requestAnimationFrame(step);
  })(start);
}

const statsBar = document.querySelector('.hero-stats-bar');
if (statsBar) {
  new IntersectionObserver(function(entries, obs) {
    if (!entries[0].isIntersecting) return;
    obs.disconnect();
    api.get('/api/admin/stats')
      .then(function(data) {
        countUp(document.getElementById('stat-alunos'),     data.alunos_ativos  || 500, '+', 1800);
        countUp(document.getElementById('stat-modalidades'), data.modalidades    || 15,  '+', 1400);
      })
      .catch(function() {
        countUp(document.getElementById('stat-alunos'),     500, '+', 1800);
        countUp(document.getElementById('stat-modalidades'), 15,  '+', 1400);
      });
  }, { threshold: 0.4 }).observe(statsBar);
}

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
  if (window.self !== window.top) return; // roda dentro do phone-mockup do hero — invisível, não vale o RAF contínuo
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
  '.plan-card, .step-card, .depoimento-card, .gamificacao-copy, .gamificacao-visual, .faq-item'
).forEach((el, i) => {
  if (!el.classList.contains('reveal')) el.classList.add('reveal');
  if (i % 4 === 1) el.classList.add('reveal-delay-1');
  if (i % 4 === 2) el.classList.add('reveal-delay-2');
  if (i % 4 === 3) el.classList.add('reveal-delay-3');
  revealObs.observe(el);
});
