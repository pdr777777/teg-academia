document.getElementById('btn-logout').addEventListener('click', logout);
document.getElementById('btn-logout-gate')?.addEventListener('click', logout);

let usuarioId = null;

function medalha(posicao) {
  if (posicao === 1) return 'top1';
  if (posicao === 2) return 'top2';
  if (posicao === 3) return 'top3';
  return '';
}

async function carregarRanking(tipo) {
  const body = document.getElementById('ranking-body');
  const minhaCard = document.getElementById('minha-posicao-card');
  body.innerHTML = '<tr><td colspan="5" class="loading-row"><span class="spinner"></span></td></tr>';

  try {
    const { ranking, minha_posicao } = await api.get(`/api/ranking?tipo=${tipo}`);

    if (!ranking.length) {
      body.innerHTML = '<tr><td colspan="5" class="empty-state">Ninguém treinou neste período ainda.</td></tr>';
    } else {
      body.innerHTML = ranking.map((r) => `
        <tr class="${r.id === usuarioId ? 'linha-eu' : ''}">
          <td><span class="ranking-pos ${medalha(r.posicao)}">${r.posicao}</span></td>
          <td>
            <div class="ranking-avatar-row">
              <span class="avatar-fallback">${escapeHtml(iniciais(r.nome))}</span>
              <span>${escapeHtml(r.nome)}${r.id === usuarioId ? ' (você)' : ''}</span>
            </div>
          </td>
          <td>${r.treinos}</td>
          <td>${r.xp} XP</td>
          <td>${r.sequencia_atual} dias</td>
        </tr>
      `).join('');
    }

    if (minha_posicao) {
      minhaCard.style.display = 'flex';
      minhaCard.innerHTML = `
        <span class="posicao-num">#${minha_posicao.posicao}</span>
        <div>
          <strong>Sua posição</strong>
          <div class="text-muted" style="font-size:.85rem">${minha_posicao.treinos} treinos · ${minha_posicao.xp} XP · sequência de ${minha_posicao.sequencia_atual} dias</div>
        </div>
      `;
    } else {
      minhaCard.style.display = 'none';
    }
  } catch (err) {
    body.innerHTML = '<tr><td colspan="5" class="empty-state">Não foi possível carregar o ranking.</td></tr>';
  }
}

async function carregarConquistas() {
  const grid = document.getElementById('conquistas-grid');
  try {
    const conquistas = await api.get(`/api/ranking/conquistas/${usuarioId}`);
    grid.innerHTML = conquistas.map((c) => `
      <div class="conquista-card${c.desbloqueada_em ? ' desbloqueada' : ''}">
        <span class="icon-badge">${Icons.icon('award', { size: 20 })}</span>
        <strong>${escapeHtml(c.nome)}</strong>
        <span>${c.desbloqueada_em ? formatData(c.desbloqueada_em) : 'Bloqueada'}</span>
      </div>
    `).join('');
  } catch (err) {
    grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1">Não foi possível carregar as conquistas.</div>';
  }
}

document.getElementById('tabs-ranking').addEventListener('click', (ev) => {
  const btn = ev.target.closest('.tab');
  if (!btn) return;
  document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
  btn.classList.add('active');
  carregarRanking(btn.dataset.tipo);
});

// Fora do app nativo essa tela só mostra o convite pra baixar o app (ver
// app-gate.js) — não faz sentido gastar chamada de API pra renderizar
// conteúdo que fica escondido.
if (document.documentElement.getAttribute('data-client') === 'native') {
  initTabsIndicator(document.getElementById('tabs-ranking'), { gooey: true });

  (async function init() {
    try {
      const me = await api.get('/api/auth/me');
      usuarioId = me.id;
    } catch (err) {
      // segue sem destaque de "você" se falhar
    }
    carregarRanking('semanal');
    if (usuarioId) carregarConquistas();
  })();
}
