document.getElementById('btn-logout').addEventListener('click', logout);

const STATUS_LABEL = {
  pendente: { label: 'Pendente', classe: 'badge-warning' },
  convertido: { label: 'Convertido', classe: 'badge-success' },
  expirado: { label: 'Expirado', classe: 'badge-muted' },
};

async function carregarLink() {
  try {
    const { link } = await api.get('/api/indicacoes/meu-link');
    document.getElementById('input-link').value = link;
    document.getElementById('btn-whatsapp').href =
      `https://wa.me/?text=${encodeURIComponent('Vem treinar comigo na Academia TEG! Use meu link e ganhe desconto na matrícula: ' + link)}`;
  } catch (err) {
    toast('Não foi possível carregar seu link de indicação.', 'error');
  }
}

document.getElementById('btn-copiar').addEventListener('click', async () => {
  const input = document.getElementById('input-link');
  await navigator.clipboard.writeText(input.value);
  toast('Link copiado!', 'success');
});

async function carregarStats() {
  try {
    const stats = await api.get('/api/indicacoes/stats');
    animateNumber(document.getElementById('stat-total'), stats.total);
    animateNumber(document.getElementById('stat-convertidos'), stats.convertidos);
    animateNumber(document.getElementById('stat-pendentes'), stats.pendentes);
  } catch (err) {
    // mantém zeros
  }
}

async function carregarIndicacoes() {
  const body = document.getElementById('indicacoes-body');
  try {
    const indicacoes = await api.get('/api/indicacoes/minhas');
    body.innerHTML = indicacoes.length
      ? indicacoes.map((i) => {
          const s = STATUS_LABEL[i.status] || STATUS_LABEL.pendente;
          return `
            <tr>
              <td>${i.lead_nome || 'Aguardando cadastro'}</td>
              <td>${i.lead_telefone || '-'}</td>
              <td><span class="badge ${s.classe}">${s.label}</span></td>
              <td>${formatData(i.created_at)}</td>
            </tr>
          `;
        }).join('')
      : '<tr><td colspan="4" class="empty-state">Você ainda não indicou ninguém. Compartilhe seu link!</td></tr>';
  } catch (err) {
    body.innerHTML = '<tr><td colspan="4" class="empty-state">Não foi possível carregar suas indicações.</td></tr>';
  }
}

carregarLink();
carregarStats();
carregarIndicacoes();
