document.getElementById('btn-mobile-menu').innerHTML = Icons.icon('menu', { size: 20 });

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
