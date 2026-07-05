const CARDS = [
  { key: 'alunos_ativos', icone: 'users', label: 'Alunos ativos', fmt: (v) => v, money: false },
  { key: 'faturamento_mes', icone: 'banknote', label: 'Faturamento do mês', fmt: formatMoeda, money: true },
  { key: 'inadimplentes', icone: 'alert-triangle', label: 'Inadimplentes', fmt: (v) => v, cor: 'var(--color-danger)', money: false },
  { key: 'novos_mes', icone: 'user-check', label: 'Novos alunos no mês', fmt: (v) => v, cor: 'var(--color-success)', money: false },
  { key: 'cancelamentos_mes', icone: 'user-x', label: 'Cancelamentos no mês', fmt: (v) => v, cor: 'var(--color-danger)', money: false },
  { key: 'ticket_medio', icone: 'trending-up', label: 'Ticket médio', fmt: formatMoeda, money: true },
];

async function carregarDashboard() {
  const container = document.getElementById('admin-cards');
  try {
    const d = await api.get('/api/admin/dashboard');

    container.innerHTML = CARDS.map((c) => `
      <div class="card stat-card" data-reveal>
        <span class="stat-icon" style="${c.cor ? `color:${c.cor}` : ''}">${Icons.icon(c.icone, { size: 20 })}</span>
        <strong data-key="${c.key}">0</strong>
        <span>${c.label}</span>
      </div>
    `).join('');
    initReveal();

    CARDS.forEach((c) => {
      const el = container.querySelector(`[data-key="${c.key}"]`);
      animateNumber(el, Number(d[c.key]) || 0, { format: c.money ? formatMoeda : undefined });
    });

    renderGrafico(d.grafico_faturamento);
  } catch (err) {
    container.innerHTML = '<div class="empty-state" style="grid-column:1/-1">Não foi possível carregar os dados.</div>';
  }
}

function renderGrafico(dados) {
  const el = document.getElementById('grafico-faturamento');
  if (!dados.length) {
    el.innerHTML = '<div class="empty-state">Sem faturamento registrado ainda.</div>';
    return;
  }
  const max = Math.max(...dados.map((d) => Number(d.faturamento)), 1);
  el.innerHTML = dados.map((d) => `
    <div class="chart-bar-col">
      <span class="chart-bar-value">${formatMoeda(d.faturamento)}</span>
      <div class="chart-bar" style="height:0" data-height="${Math.max(4, (Number(d.faturamento) / max) * 100)}"></div>
      <span class="chart-bar-label">${d.mes.slice(5)}/${d.mes.slice(2, 4)}</span>
    </div>
  `).join('');
  requestAnimationFrame(() => {
    setTimeout(() => {
      el.querySelectorAll('.chart-bar').forEach((bar) => {
        bar.style.height = `${bar.dataset.height}%`;
      });
    }, 50);
  });
}

carregarDashboard();
