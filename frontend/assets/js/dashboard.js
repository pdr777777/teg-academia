document.getElementById('btn-logout').addEventListener('click', logout);

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
    document.getElementById('dash-xp').textContent = `${d.xp} XP`;
    document.getElementById('dash-sequencia').textContent = d.sequencia_atual;

    const planoBadge = document.getElementById('dash-plano-badge');
    planoBadge.textContent = d.plano_nome
      ? `Plano ${d.plano_nome} — ${d.matricula_status === 'ativa' ? 'ativo' : d.matricula_status}`
      : 'Sem plano ativo';

    document.getElementById('stat-vencimento').textContent = formatData(d.data_vencimento);
    document.getElementById('stat-freq-mes').textContent = d.dias_treinados_mes;
    document.getElementById('stat-total-treinos').textContent = d.total_treinos;
    document.getElementById('stat-maior-sequencia').textContent = d.maior_sequencia;

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

    let html = '';
    for (let i = 0; i < primeiroDiaSemana; i++) html += '<div class="cal-dia vazio"></div>';
    for (let dia = 1; dia <= totalDias; dia++) {
      html += `<div class="cal-dia${diasTreinados.has(dia) ? ' treinou' : ''}">${dia}</div>`;
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
    await Promise.all([carregarDashboard(), carregarCalendario()]);
  } catch (err) {
    toast(err.message || 'Erro ao registrar check-in.', 'error');
  } finally {
    btn.disabled = false;
  }
});

carregarDashboard();
carregarCalendario();
