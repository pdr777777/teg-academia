// frontend/assets/js/admin-catraca.js
function formatarData(iso) {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function renderStatusCatracas(catracas) {
  const container = document.getElementById('catraca-status-cards');
  container.innerHTML = catracas.map((c) => `
    <div class="card stat-card" data-reveal>
      <span class="stat-icon" style="color:${c.online ? 'var(--color-success)' : 'var(--color-danger)'}">
        ${Icons.icon(c.online ? 'shield-check' : 'shield', { size: 20 })}
      </span>
      <strong>${c.online ? 'Online' : 'Offline'}</strong>
      <span>${escapeHtml(c.catraca)}</span>
    </div>
  `).join('');
}

async function carregarCatraca() {
  try {
    const d = await api.get('/api/catraca/status');

    renderStatusCatracas(d.catracas);

    const cardsContainer = document.getElementById('catraca-cards');
    cardsContainer.innerHTML = `
      <div class="card stat-card" data-reveal><span class="stat-icon">${Icons.icon('users', { size: 20 })}</span><strong>${d.sincronizados}</strong><span>Alunos sincronizados</span></div>
      <div class="card stat-card" data-reveal><span class="stat-icon">${Icons.icon('clock', { size: 20 })}</span><strong>${d.pendentes_presencial}</strong><span>Rostos pendentes (cadastro presencial)</span></div>
      <div class="card stat-card" data-reveal><span class="stat-icon">${Icons.icon('shield-check', { size: 20 })}</span><strong>${d.acessos_hoje}</strong><span>Acessos autorizados hoje</span></div>
    `;
    initReveal();

    renderLineChart('catraca-grafico', d.grafico_acessos.map((g) => ({
      label: new Date(g.hora).toLocaleString('pt-BR', { day: '2-digit', hour: '2-digit' }),
      valor: Number(g.total),
    })));

    const feedBody = document.getElementById('catraca-feed-body');
    if (!d.feed.length) {
      feedBody.innerHTML = '<tr><td colspan="4" class="empty-state">Nenhum acesso registrado ainda.</td></tr>';
    } else {
      feedBody.innerHTML = d.feed.map((f) => `
        <tr>
          <td>${escapeHtml(f.nome || 'Não identificado')}</td>
          <td>${escapeHtml(f.catraca)}</td>
          <td>${escapeHtml(f.tipo)}</td>
          <td>${formatarData(f.criado_em)}</td>
        </tr>
      `).join('');
    }
  } catch (err) {
    document.getElementById('catraca-status-cards').innerHTML = '<div class="empty-state" style="grid-column:1/-1">Não foi possível carregar os dados.</div>';
  }
}

carregarCatraca();
