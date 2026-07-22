const dialog = document.getElementById('dialog-plano');
const form = document.getElementById('form-plano');

document.getElementById('btn-plano-cancel').addEventListener('click', () => dialog.close());

async function carregarPlanos() {
  const body = document.getElementById('planos-body');
  body.innerHTML = '<tr><td colspan="6" class="loading-row"><span class="spinner"></span></td></tr>';
  try {
    const planos = await api.get('/api/admin/planos');
    body.innerHTML = planos.length
      ? planos.map((p) => `
          <tr>
            <td><strong>${escapeHtml(p.nome)}</strong><div class="text-muted" style="font-size:.78rem">${escapeHtml(p.descricao || '')}</div></td>
            <td>${p.duracao_dias} dias</td>
            <td>${formatMoeda(p.preco_mensal)}</td>
            <td>${p.alunos_ativos}</td>
            <td><span class="badge ${p.ativo ? 'badge-success' : 'badge-muted'}">${p.ativo ? 'Ativo' : 'Inativo'}</span></td>
            <td style="display:flex;gap:.4rem">
              <button class="btn btn-ghost btn-sm" data-edit-id="${p.id}" title="Editar">
                ${Icons.icon('edit-2', { size: 14 })}
              </button>
              <button class="btn btn-ghost btn-sm" data-toggle-id="${p.id}" data-toggle-ativo="${p.ativo}" title="${p.ativo ? 'Desativar' : 'Ativar'}">
                ${Icons.icon(p.ativo ? 'eye-off' : 'eye', { size: 14 })}
              </button>
            </td>
          </tr>
        `).join('')
      : '<tr><td colspan="6" class="empty-state">Nenhum plano criado ainda. Clique em "Novo plano" para começar.</td></tr>';
  } catch (err) {
    body.innerHTML = '<tr><td colspan="6" class="empty-state">Não foi possível carregar os planos.</td></tr>';
  }
}

document.getElementById('btn-novo-plano').addEventListener('click', () => {
  document.getElementById('dialog-plano-titulo').textContent = 'Novo plano';
  document.getElementById('plano-edit-id').value = '';
  form.reset();
  dialog.showModal();
});

document.getElementById('planos-body').addEventListener('click', async (ev) => {
  const btnEdit = ev.target.closest('[data-edit-id]');
  if (btnEdit) {
    const id = btnEdit.dataset.editId;
    try {
      const planos = await api.get('/api/admin/planos');
      const p = planos.find((x) => String(x.id) === String(id));
      if (!p) return;
      document.getElementById('dialog-plano-titulo').textContent = 'Editar plano';
      document.getElementById('plano-edit-id').value = p.id;
      document.getElementById('plano-nome').value = p.nome;
      document.getElementById('plano-descricao').value = p.descricao || '';
      document.getElementById('plano-preco').value = p.preco_mensal;
      document.getElementById('plano-duracao').value = p.duracao_dias;
      dialog.showModal();
    } catch { toast('Erro ao carregar plano.', 'error'); }
    return;
  }

  const btnToggle = ev.target.closest('[data-toggle-id]');
  if (btnToggle) {
    const id = btnToggle.dataset.toggleId;
    const ativo = btnToggle.dataset.toggleAtivo === 'true';
    btnToggle.disabled = true;
    try {
      await api.put(`/api/planos/${id}`, { ativo: !ativo });
      toast(`Plano ${!ativo ? 'ativado' : 'desativado'}.`, 'success');
      carregarPlanos();
    } catch (err) {
      toast(err.message || 'Erro ao atualizar plano.', 'error');
    } finally {
      btnToggle.disabled = false;
    }
  }
});

form.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const btn = document.getElementById('btn-plano-confirm');
  setBtnLoading(btn, 'Salvando...');

  const id = document.getElementById('plano-edit-id').value;
  const body = {
    nome: document.getElementById('plano-nome').value.trim(),
    descricao: document.getElementById('plano-descricao').value.trim(),
    preco_mensal: parseFloat(document.getElementById('plano-preco').value),
    duracao_dias: parseInt(document.getElementById('plano-duracao').value, 10),
  };

  try {
    if (id) {
      await api.put(`/api/planos/${id}`, body);
      toast('Plano atualizado!', 'success');
    } else {
      await api.post('/api/planos', body);
      toast('Plano criado!', 'success');
    }
    dialog.close();
    carregarPlanos();
  } catch (err) {
    toast(err.message || 'Erro ao salvar plano.', 'error');
  } finally {
    resetBtnLoading(btn);
  }
});

carregarPlanos();
