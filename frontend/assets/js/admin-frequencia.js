const FREQ_CARDS = [
  { key: 'treinaram_hoje', icone: 'check-circle', label: 'Treinaram hoje', cor: 'var(--color-success)' },
  { key: 'sumidos', icone: 'alert-triangle', label: 'Sumidos (14+ dias sem treinar)', cor: 'var(--color-danger)' },
  { key: 'total_alunos_ativos', icone: 'users', label: 'Alunos ativos' },
];

let alunosFrequencia = [];

function severidade(dias) {
  if (dias <= 2) return { texto: 'Em dia', classe: 'badge-success' };
  if (dias <= 7) return { texto: `${dias} dias`, classe: 'badge-muted' };
  if (dias <= 14) return { texto: `${dias} dias, atenção`, classe: 'badge-warning' };
  return { texto: `${dias} dias, sumiu`, classe: 'badge-danger' };
}

function renderFrequencia(lista) {
  const body = document.getElementById('frequencia-body');
  body.innerHTML = lista.length
    ? lista.map((a) => {
        const sev = severidade(a.dias_ausente);
        return `
          <tr>
            <td>
              <div class="ranking-avatar-row">
                <span class="avatar-fallback">${escapeHtml(iniciais(a.nome))}</span>
                <div><strong>${escapeHtml(a.nome)}</strong><div class="text-muted" style="font-size:.78rem">${escapeHtml(a.email)}</div></div>
              </div>
            </td>
            <td>${a.ultimo_treino ? formatData(a.ultimo_treino) : 'Nunca treinou'}</td>
            <td><span class="badge ${sev.classe}">${sev.texto}</span></td>
            <td>${a.treinos_mes}</td>
          </tr>
        `;
      }).join('')
    : '<tr><td colspan="4" class="empty-state">Nenhum aluno encontrado.</td></tr>';
}

async function carregarFrequencia() {
  const cardsEl = document.getElementById('frequencia-cards');
  try {
    const d = await api.get('/api/frequencias/resumo');
    alunosFrequencia = d.alunos;

    cardsEl.innerHTML = FREQ_CARDS.map((c) => `
      <div class="card stat-card" data-reveal>
        <span class="stat-icon" style="${c.cor ? `color:${c.cor}` : ''}">${Icons.icon(c.icone, { size: 20 })}</span>
        <strong data-key="${c.key}">0</strong>
        <span>${c.label}</span>
      </div>
    `).join('');
    initReveal();
    FREQ_CARDS.forEach((c) => {
      animateNumber(cardsEl.querySelector(`[data-key="${c.key}"]`), Number(d[c.key]) || 0);
    });

    renderFrequencia(alunosFrequencia);
  } catch (err) {
    cardsEl.innerHTML = '<div class="empty-state" style="grid-column:1/-1">Não foi possível carregar os dados.</div>';
    document.getElementById('frequencia-body').innerHTML = '<tr><td colspan="4" class="empty-state">Não foi possível carregar a frequência.</td></tr>';
  }
}

document.getElementById('busca-frequencia').addEventListener('input', debounce((ev) => {
  const termo = ev.target.value.trim().toLowerCase();
  const filtrados = termo
    ? alunosFrequencia.filter((a) => a.nome.toLowerCase().includes(termo) || (a.email || '').toLowerCase().includes(termo))
    : alunosFrequencia;
  renderFrequencia(filtrados);
}));

carregarFrequencia();
