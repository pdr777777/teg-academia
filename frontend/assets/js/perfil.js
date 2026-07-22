document.getElementById('btn-logout').addEventListener('click', logout);

async function carregarPerfil() {
  try {
    const u = await api.get('/api/alunos/perfil');
    document.getElementById('perfil-avatar-wrap').innerHTML = renderAvatar(u.nome, u.foto_url, 56);
    document.getElementById('perfil-nome-display').textContent = u.nome;
    document.getElementById('perfil-email-display').textContent = u.email;
    document.getElementById('perfil-nome').value = u.nome || '';
    document.getElementById('perfil-telefone').value = u.telefone || '';
    document.getElementById('perfil-nascimento').value = u.data_nascimento ? u.data_nascimento.slice(0, 10) : '';
    document.getElementById('perfil-cpf').value = u.cpf || 'Não informado';
    document.getElementById('perfil-apelido').value = u.apelido || '';

    const statusBadge = document.getElementById('assinatura-status-badge');
    const statusMap = {
      ativa: ['badge-success', 'Em dia'],
      vencida: ['badge-warning', 'Vencida'],
      suspensa: ['badge-danger', 'Suspensa'],
      cancelada: ['badge-muted', 'Cancelada'],
    };
    const [statusClass, statusLabel] = statusMap[u.matricula_status] || ['badge-muted', 'Sem plano'];
    statusBadge.className = `badge ${statusClass}`;
    statusBadge.textContent = statusLabel;

    document.getElementById('assinatura-plano').textContent = u.plano_nome ? `Plano ${u.plano_nome}` : 'Nenhum plano contratado.';
    document.getElementById('assinatura-vencimento').textContent = u.data_vencimento
      ? `Vencimento: ${formatData(u.data_vencimento)}`
      : '';

    try {
      const pagamentos = await api.get('/api/pagamentos/meus');
      const historicoEl = document.getElementById('assinatura-historico');
      historicoEl.innerHTML = pagamentos.length
        ? pagamentos.slice(0, 5).map((p) => `
            <div class="transaction-item">
              <span class="transaction-icon ${p.status}">${Icons.icon(p.status === 'pago' ? 'check-circle' : 'clock', { size: 16 })}</span>
              <div class="transaction-info">
                <strong>${escapeHtml(p.plano_nome)}</strong>
                <span>${formatData(p.data_pagamento || p.created_at)}</span>
              </div>
              <span class="transaction-value">${formatMoeda(p.valor)}</span>
            </div>
          `).join('')
        : '<div class="empty-state">Nenhum pagamento registrado ainda.</div>';
    } catch {
      document.getElementById('assinatura-historico').innerHTML = '<div class="empty-state">Não foi possível carregar o histórico.</div>';
    }
  } catch (err) {
    toast(err.message || 'Erro ao carregar seu perfil.', 'error');
  }
}

document.getElementById('form-perfil').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const btn = document.getElementById('btn-perfil-salvar');
  setBtnLoading(btn, 'Salvando...');

  try {
    await api.patch('/api/alunos/perfil', {
      nome: document.getElementById('perfil-nome').value.trim(),
      telefone: document.getElementById('perfil-telefone').value.trim(),
      data_nascimento: document.getElementById('perfil-nascimento').value || null,
      apelido: document.getElementById('perfil-apelido').value.trim() || null,
    });
    toast('Perfil atualizado!', 'success');
    carregarPerfil();
  } catch (err) {
    toast(err.message || 'Erro ao salvar perfil.', 'error');
  } finally {
    resetBtnLoading(btn);
  }
});

document.getElementById('perfil-foto-input').addEventListener('change', async (ev) => {
  const arquivo = ev.target.files[0];
  if (!arquivo) return;

  const formData = new FormData();
  formData.append('foto', arquivo);

  try {
    const token = localStorage.getItem('token');
    const resposta = await fetch(`${API_URL}/api/alunos/perfil/foto`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    if (!resposta.ok) {
      const erro = await resposta.json();
      throw new Error(erro.error || 'Erro ao enviar foto');
    }
    toast('Foto atualizada!', 'success');
    carregarPerfil();
  } catch (err) {
    toast(err.message || 'Erro ao enviar foto.', 'error');
  } finally {
    ev.target.value = '';
  }
});

carregarPerfil();
