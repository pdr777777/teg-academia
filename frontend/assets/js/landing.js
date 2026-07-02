document.getElementById('btn-mobile-menu').innerHTML = Icons.icon('menu', { size: 20 });

// ===== PrismaticBurst background =====
(function () {
  const canvas = document.querySelector('.hero-burst-canvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const COLORS = ['#b10000', '#d74600', '#cc2200', '#ff4400', '#9e0000'];
  const RAY_COUNT = 22;
  const SPEED = 0.28;
  const INTENSITY = 1.8;
  let angle = 0;
  let raf;

  function resize() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width  = canvas.offsetWidth  * dpr;
    canvas.height = canvas.offsetHeight * dpr;
  }
  window.addEventListener('resize', () => { resize(); });
  resize();

  function hex2rgb(hex) {
    return [parseInt(hex.slice(1,3),16), parseInt(hex.slice(3,5),16), parseInt(hex.slice(5,7),16)];
  }

  function draw() {
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    const cx = w * 0.74;
    const cy = h * 0.48;
    const maxLen = Math.hypot(w, h) * 1.1;

    for (let i = 0; i < RAY_COUNT; i++) {
      const a = (i / RAY_COUNT) * Math.PI * 2 + angle;
      const [r, g, b] = hex2rgb(COLORS[i % COLORS.length]);
      const pulse = 0.65 + 0.35 * Math.sin(i * 1.73 + angle * 2.5);
      const alpha = 0.18 * INTENSITY * pulse;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(a);

      const grad = ctx.createLinearGradient(0, 0, maxLen, 0);
      grad.addColorStop(0,    `rgba(${r},${g},${b},${Math.min(alpha * 3, 0.9)})`);
      grad.addColorStop(0.08, `rgba(${r},${g},${b},${alpha * 1.5})`);
      grad.addColorStop(0.28, `rgba(${r},${g},${b},${alpha * 0.5})`);
      grad.addColorStop(0.6,  `rgba(${r},${g},${b},${alpha * 0.15})`);
      grad.addColorStop(1,    `rgba(${r},${g},${b},0)`);

      const tipW  = maxLen * 0.06 * (0.35 + 0.65 * Math.abs(Math.sin(i * 0.88)));
      const baseW = tipW * 0.07;

      ctx.beginPath();
      ctx.moveTo(0, -baseW);
      ctx.lineTo(maxLen, -tipW / 2);
      ctx.lineTo(maxLen,  tipW / 2);
      ctx.lineTo(0,  baseW);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.restore();
    }

    // Soft center glow
    const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxLen * 0.35);
    glow.addColorStop(0,   'rgba(200,40,0,0.12)');
    glow.addColorStop(0.4, 'rgba(150,20,0,0.05)');
    glow.addColorStop(1,   'rgba(0,0,0,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);

    angle += SPEED * 0.004;
    raf = requestAnimationFrame(draw);
  }

  draw();
})();

document.getElementById('stat-alunos').textContent = '500+';

const ESTRUTURA = [
  { icon: 'dumbbell', titulo: 'Musculação', desc: 'Equipamentos de última geração, renovados anualmente.' },
  { icon: 'flame', titulo: 'Cross Training', desc: 'Espaço funcional completo para treinos de alta intensidade.' },
  { icon: 'users', titulo: 'Aulas coletivas', desc: 'Spinning, jump, dança e muito mais, todos os dias.' },
  { icon: 'user-check', titulo: 'Acompanhamento', desc: 'Professores especializados por área acompanham sua evolução.' },
];

document.getElementById('estrutura-grid').innerHTML = ESTRUTURA.map((e) => `
  <div class="card feature-card">
    <div class="feature-icon">${Icons.icon(e.icon, { size: 22 })}</div>
    <h3>${e.titulo}</h3>
    <p>${e.desc}</p>
  </div>
`).join('');

const DEPOIMENTOS = [
  { nome: 'Marina Souza', tag: 'Aluna há 2 anos', texto: 'Troquei de academia e não me arrependo. O acompanhamento dos professores faz toda diferença.' },
  { nome: 'Rafael Torres', tag: 'Aluno há 8 meses', texto: 'A área do aluno com XP e sequência me motiva a não faltar. Melhor academia que já treinei.' },
  { nome: 'Camila Duarte', tag: 'Aluna há 1 ano', texto: 'Estrutura excelente, ambiente limpo e horários que cabem na minha rotina.' },
];

document.getElementById('depoimentos-grid').innerHTML = DEPOIMENTOS.map((d) => `
  <div class="card depoimento-card">
    <div class="stars">${Icons.icon('star', { size: 15 }).repeat(5)}</div>
    <p>&ldquo;${d.texto}&rdquo;</p>
    <div class="depoimento-autor">
      <span class="avatar-fallback">${iniciais(d.nome)}</span>
      <div><strong>${d.nome}</strong><span>${d.tag}</span></div>
    </div>
  </div>
`).join('');

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
    tbody.innerHTML = linhas.length ? linhas.join('') : '<tr><td colspan="4" class="empty-state">Grade de horários em breve.</td></tr>';
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="4" class="empty-state">Não foi possível carregar os horários agora.</td></tr>';
  }
}

document.getElementById('form-lead').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const form = ev.target;
  const btn = form.querySelector('button[type="submit"]');
  const params = new URLSearchParams(window.location.search);

  btn.disabled = true;
  btn.textContent = 'Enviando...';
  try {
    await api.post('/api/leads', {
      nome: form.nome.value,
      telefone: form.telefone.value,
      objetivo: form.objetivo.value,
      origem: 'site',
      ref: params.get('ref') || undefined,
    });
    toast('Recebemos seus dados! Em breve entraremos em contato.', 'success');
    form.reset();
  } catch (err) {
    toast(err.message || 'Erro ao enviar. Tente novamente.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Agendar aula grátis';
  }
});

carregarHorarios();

// Scroll reveal
const revealObserver = new IntersectionObserver(
  (entries) => entries.forEach((e) => {
    if (e.isIntersecting) {
      e.target.classList.add('in-view');
      revealObserver.unobserve(e.target);
    }
  }),
  { threshold: 0.07, rootMargin: '0px 0px -40px 0px' }
);
document.querySelectorAll(
  '#estrutura .card, #planos .plano-vitrine-card, #depoimentos .card, #agendar .card'
).forEach((el, i) => {
  el.classList.add('reveal');
  if (i % 4 === 1) el.classList.add('reveal-delay-1');
  if (i % 4 === 2) el.classList.add('reveal-delay-2');
  if (i % 4 === 3) el.classList.add('reveal-delay-3');
  revealObserver.observe(el);
});
