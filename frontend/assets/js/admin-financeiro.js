const FIN_CARDS = [
  { key: 'faturamento_mes', icone: 'wallet', label: 'Faturamento do mês', money: true, trend: true },
  { key: 'ticket_medio', icone: 'trending-up', label: 'Ticket médio', money: true },
  { key: 'alunos_ativos', icone: 'users', label: 'Alunos ativos', money: false },
  { key: 'inadimplentes', icone: 'alert-triangle', label: 'Inadimplentes', money: false, cor: 'var(--color-danger)' },
];

const DONUT_CORES = ['var(--color-primary)', 'var(--color-wine)', 'var(--color-coral)', 'var(--color-success)', 'var(--color-warning)'];

function trendPillHtml(pct) {
  if (pct === null || pct === undefined) return '';
  const dir = pct > 0.5 ? 'up' : pct < -0.5 ? 'down' : 'flat';
  const seta = dir === 'up' ? 'trending-up' : dir === 'down' ? 'trending-down' : 'chevron-right';
  return `<span class="trend-pill ${dir}">${Icons.icon(seta, { size: 12 })}${pct > 0 ? '+' : ''}${pct.toFixed(1)}% vs mês anterior</span>`;
}

async function carregarFinanceiro() {
  const cardsEl = document.getElementById('financeiro-cards');
  try {
    const d = await api.get('/api/admin/financeiro');

    cardsEl.innerHTML = FIN_CARDS.map((c) => `
      <div class="card stat-card" data-reveal>
        <span class="stat-icon" style="${c.cor ? `color:${c.cor}` : ''}">${Icons.icon(c.icone, { size: 20 })}</span>
        <strong data-key="${c.key}">0</strong>
        <span>${c.label}</span>
        ${c.trend ? `<span data-trend>${trendPillHtml(d.variacao_faturamento_pct)}</span>` : ''}
      </div>
    `).join('');
    initReveal();

    FIN_CARDS.forEach((c) => {
      const el = cardsEl.querySelector(`[data-key="${c.key}"]`);
      animateNumber(el, Number(d[c.key]) || 0, { format: c.money ? formatMoeda : undefined });
    });

    renderLineChart('grafico-faturamento', (d.grafico_faturamento || []).map((g) => ({
      label: `${g.mes.slice(5)}/${g.mes.slice(2, 4)}`,
      valor: Number(g.faturamento),
    })), { format: formatMoeda });
    renderDonutPlanos(d.distribuicao_planos, d.alunos_ativos);
    renderTransacoes(d.transacoes_recentes);
    renderMetas(d.metas, d.faturamento_mes, d.novos_mes);
  } catch (err) {
    cardsEl.innerHTML = '<div class="empty-state" style="grid-column:1/-1">Não foi possível carregar os dados.</div>';
  }
}

function renderDonutPlanos(distribuicao, totalAtivos) {
  const el = document.getElementById('donut-planos');
  if (!distribuicao || !distribuicao.length) {
    el.innerHTML = '<div class="empty-state">Nenhum aluno com matrícula ativa ainda.</div>';
    return;
  }
  const total = distribuicao.reduce((s, d) => s + d.total, 0) || 1;
  let acc = 0;
  const stops = distribuicao.map((d, i) => {
    const from = (acc / total) * 100;
    acc += d.total;
    const to = (acc / total) * 100;
    return `${DONUT_CORES[i % DONUT_CORES.length]} ${from}% ${to}%`;
  }).join(', ');

  const legenda = distribuicao.map((d, i) => `
    <li>
      <span class="dot" style="background:${DONUT_CORES[i % DONUT_CORES.length]}"></span>
      ${d.nome}
      <b>${d.total} (${Math.round((d.total / total) * 100)}%)</b>
    </li>
  `).join('');

  el.innerHTML = `
    <div class="donut-wrap">
      <div class="donut" style="background: conic-gradient(${stops})">
        <div class="donut-hole"><strong>${totalAtivos}</strong><span>ativos</span></div>
      </div>
      <ul class="donut-legend">${legenda}</ul>
    </div>
  `;
}

function renderTransacoes(transacoes) {
  const el = document.getElementById('transacoes-recentes');
  if (!transacoes || !transacoes.length) {
    el.innerHTML = '<div class="empty-state">Nenhuma transação registrada ainda.</div>';
    return;
  }
  el.innerHTML = transacoes.map((t) => `
    <div class="transaction-item">
      <span class="transaction-icon ${t.status}">${Icons.icon(t.status === 'pago' ? 'check-circle' : t.status === 'pendente' ? 'clock' : 'alert-triangle', { size: 17 })}</span>
      <div class="transaction-info">
        <strong>${t.aluno_nome}</strong>
        <span>${formatData(t.data_pagamento || t.created_at)} · ${t.metodo || 'pendente'}</span>
      </div>
      <span class="transaction-value">${formatMoeda(t.valor)}</span>
    </div>
  `).join('');
}

function renderMetas(metas, faturamentoMes, novosMes) {
  const el = document.getElementById('metas-progresso');
  if (!metas.meta_faturamento_mensal && !metas.meta_novos_alunos_mensal) {
    el.innerHTML = '<div class="empty-state">Defina metas mensais em <a href="configuracoes.html" class="text-primary">Configurações</a>.</div>';
    return;
  }
  el.innerHTML = `
    ${metas.meta_faturamento_mensal ? `
      <div class="goal-bar">
        <div class="goal-bar-head">
          <strong>Meta de faturamento</strong>
          <span>${formatMoeda(faturamentoMes)} / ${formatMoeda(metas.meta_faturamento_mensal)}</span>
        </div>
        <div class="goal-bar-track"><div class="goal-bar-fill" data-width="${metas.progresso_faturamento_pct}"></div></div>
      </div>` : ''}
    ${metas.meta_novos_alunos_mensal ? `
      <div class="goal-bar">
        <div class="goal-bar-head">
          <strong>Meta de novos alunos</strong>
          <span>${novosMes} / ${metas.meta_novos_alunos_mensal}</span>
        </div>
        <div class="goal-bar-track"><div class="goal-bar-fill" data-width="${metas.progresso_novos_alunos_pct}"></div></div>
      </div>` : ''}
  `;
  requestAnimationFrame(() => {
    setTimeout(() => {
      el.querySelectorAll('.goal-bar-fill').forEach((f) => { f.style.width = `${f.dataset.width}%`; });
    }, 50);
  });
}

carregarFinanceiro();
