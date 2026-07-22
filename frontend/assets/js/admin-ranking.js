function medalha(posicao) {
  if (posicao === 1) return 'top1';
  if (posicao === 2) return 'top2';
  if (posicao === 3) return 'top3';
  return '';
}

async function carregarRanking(tipo) {
  const body = document.getElementById('ranking-body');
  body.innerHTML = '<tr><td colspan="5" class="loading-row"><span class="spinner"></span></td></tr>';

  try {
    const { ranking } = await api.get(`/api/ranking?tipo=${tipo}`);
    body.innerHTML = ranking.length
      ? ranking.map((r) => `
          <tr>
            <td><span class="ranking-pos ${medalha(r.posicao)}">${r.posicao}</span></td>
            <td>
              <div class="ranking-avatar-row">
                <span class="avatar-fallback">${escapeHtml(iniciais(r.nome))}</span>
                <span>${escapeHtml(r.nome)}</span>
              </div>
            </td>
            <td>${r.treinos}</td>
            <td>${r.xp} XP</td>
            <td>${r.sequencia_atual} dias</td>
          </tr>
        `).join('')
      : '<tr><td colspan="5" class="empty-state">Ninguém treinou neste período ainda.</td></tr>';
  } catch (err) {
    body.innerHTML = '<tr><td colspan="5" class="empty-state">Não foi possível carregar o ranking.</td></tr>';
  }
}

document.getElementById('tabs-ranking').addEventListener('click', (ev) => {
  const btn = ev.target.closest('.tab');
  if (!btn) return;
  document.querySelectorAll('#tabs-ranking .tab').forEach((t) => t.classList.remove('active'));
  btn.classList.add('active');
  carregarRanking(btn.dataset.tipo);
});

initTabsIndicator(document.getElementById('tabs-ranking'));
carregarRanking('mensal');
