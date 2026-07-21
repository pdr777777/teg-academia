const CARDS = [
  { key: 'alunos_ativos', icone: 'users', label: 'Alunos ativos', fmt: (v) => v, money: false },
  { key: 'faturamento_mes', icone: 'banknote', label: 'Faturamento do mês', fmt: formatMoeda, money: true, hero: true },
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
      <div class="card stat-card${c.hero ? ' stat-card-hero' : ''}" data-reveal>
        <div class="stat-card-head">
          <span class="stat-icon" style="${c.cor ? `color:${c.cor}` : ''}">${Icons.icon(c.icone, { size: 18 })}</span>
          <span class="stat-card-label">${c.label}</span>
        </div>
        <strong data-key="${c.key}">0</strong>
      </div>
    `).join('');
    initReveal();

    CARDS.forEach((c) => {
      const el = container.querySelector(`[data-key="${c.key}"]`);
      animateNumber(el, Number(d[c.key]) || 0, { format: c.money ? formatMoeda : undefined });
    });

    renderLineChart('grafico-faturamento', d.grafico_faturamento.map((g) => ({
      label: `${g.mes.slice(5)}/${g.mes.slice(2, 4)}`,
      valor: Number(g.faturamento),
    })), { format: formatMoeda });
  } catch (err) {
    container.innerHTML = '<div class="empty-state" style="grid-column:1/-1">Não foi possível carregar os dados.</div>';
  }
}

carregarDashboard();
