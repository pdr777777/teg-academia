document.getElementById('btn-logout').addEventListener('click', logout);

const XP_LEVELS = [0, 500, 1200, 2500, 5000, 9000, 15000];

function calcXpLevel(xp) {
  let level = 1;
  for (let i = 0; i < XP_LEVELS.length; i++) {
    if (xp >= XP_LEVELS[i]) level = i + 1;
    else break;
  }
  const cur = XP_LEVELS[level - 1] || 0;
  const next = XP_LEVELS[level] || cur * 2;
  const pct = Math.min(((xp - cur) / (next - cur)) * 100, 100);
  return { level, pct, remaining: next - xp };
}

function saudacaoHora() {
  const h = new Date().getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

async function carregarDashboard() {
  try {
    const d = await api.get('/api/alunos/dashboard');

    document.getElementById('saudacao').textContent = `${saudacaoHora()},`;
    document.getElementById('dash-nome').textContent = d.nome;
    animateNumber(document.getElementById('dash-xp'), d.xp, { format: (v) => `${Math.round(v).toLocaleString('pt-BR')} XP` });
    document.getElementById('dash-sequencia').textContent = d.sequencia_atual;

    const lvl = calcXpLevel(d.xp);
    document.getElementById('dash-nivel').textContent = `Nível ${lvl.level}`;
    document.getElementById('dash-xp-next').textContent = `${lvl.remaining.toLocaleString('pt-BR')} XP até o próximo nível`;
    setTimeout(() => {
      const fill = document.getElementById('dash-xp-fill');
      if (fill) fill.style.width = `${lvl.pct.toFixed(1)}%`;
    }, 100);

    const planoBadge = document.getElementById('dash-plano-badge');
    planoBadge.textContent = d.plano_nome
      ? `Plano ${d.plano_nome} — ${d.matricula_status === 'ativa' ? 'ativo' : d.matricula_status}`
      : 'Sem plano ativo';

    renderBloqueioBanner('bloqueio-banner', d);

    document.getElementById('stat-vencimento').textContent = formatData(d.data_vencimento);
    animateNumber(document.getElementById('stat-freq-mes'), d.dias_treinados_mes);
    animateNumber(document.getElementById('stat-total-treinos'), d.total_treinos);
    animateNumber(document.getElementById('stat-maior-sequencia'), d.maior_sequencia);

    const lista = document.getElementById('lista-conquistas');
    lista.innerHTML = d.conquistas_recentes.length
      ? d.conquistas_recentes.map((c) => `
          <div class="conquista-item">
            <span class="icon-badge">${Icons.icon('award', { size: 18 })}</span>
            <div><strong>${c.nome}</strong><span>${formatData(c.desbloqueada_em)}</span></div>
          </div>
        `).join('')
      : '<div class="empty-state">Nenhuma conquista ainda — treine para desbloquear!</div>';
  } catch (err) {
    toast(err.message || 'Erro ao carregar seus dados.', 'error');
  }
}

async function carregarCalendario() {
  const grid = document.getElementById('calendario-grid');
  const agora = new Date();
  const mes = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`;

  try {
    const frequencias = await api.get(`/api/frequencias/minha?mes=${mes}`);
    const diasTreinados = new Set(frequencias.map((f) => new Date(f.data).getUTCDate()));

    const totalDias = new Date(agora.getFullYear(), agora.getMonth() + 1, 0).getDate();
    const primeiroDiaSemana = new Date(agora.getFullYear(), agora.getMonth(), 1).getDay();

    const diaHoje = agora.getDate();
    let html = '';
    for (let i = 0; i < primeiroDiaSemana; i++) html += '<div class="cal-dia vazio"></div>';
    for (let dia = 1; dia <= totalDias; dia++) {
      const classes = ['cal-dia'];
      if (diasTreinados.has(dia)) classes.push('treinou');
      if (dia === diaHoje) classes.push('hoje');
      html += `<div class="${classes.join(' ')}">${dia}</div>`;
    }
    grid.innerHTML = html;
  } catch (err) {
    grid.innerHTML = '<div class="empty-state">Não foi possível carregar a frequência.</div>';
  }
}

document.getElementById('btn-checkin').addEventListener('click', async (ev) => {
  const btn = ev.currentTarget;
  btn.disabled = true;
  try {
    await api.post('/api/frequencias/checkin', {});
    toast('Treino registrado! +50 XP', 'success');
    btn.classList.add('success-burst');
    setTimeout(() => btn.classList.remove('success-burst'), 600);
    await Promise.all([carregarDashboard(), carregarCalendario()]);
  } catch (err) {
    toast(err.message || 'Erro ao registrar check-in.', 'error');
  } finally {
    btn.disabled = false;
  }
});

carregarDashboard();
carregarCalendario();
