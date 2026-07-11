const ROLE_LABEL = { admin: 'Administrador', professor: 'Professor' };

async function carregarEquipe() {
  const body = document.getElementById('equipe-body');
  body.innerHTML = '<tr><td colspan="4" class="loading-row"><span class="spinner"></span></td></tr>';

  try {
    const equipe = await api.get('/api/equipe');
    body.innerHTML = equipe.length
      ? equipe.map((m) => `
          <tr>
            <td>
              <div class="ranking-avatar-row">
                <span class="avatar-fallback">${iniciais(m.nome)}</span>
                <div><strong>${m.nome}</strong><div class="text-muted" style="font-size:.78rem">${m.email}</div></div>
              </div>
            </td>
            <td><span class="badge badge-primary">${ROLE_LABEL[m.role] || m.role}</span></td>
            <td><span class="badge ${m.ativo ? 'badge-success' : 'badge-muted'}">${m.ativo ? 'Ativo' : 'Inativo'}</span></td>
            <td style="display:flex;gap:.4rem;align-items:center">
              <label class="switch">
                <input type="checkbox" data-toggle-id="${m.id}" ${m.ativo ? 'checked' : ''} />
                <span class="slider"></span>
              </label>
              <button class="btn btn-ghost btn-sm" data-reset-id="${m.id}" data-reset-nome="${m.nome}" title="Redefinir senha">
                ${Icons.icon('key', { size: 14 })}
              </button>
            </td>
          </tr>
        `).join('')
      : '<tr><td colspan="4" class="empty-state">Nenhum membro cadastrado ainda.</td></tr>';
  } catch (err) {
    body.innerHTML = '<tr><td colspan="4" class="empty-state">Não foi possível carregar a equipe.</td></tr>';
  }
}

document.getElementById('equipe-body').addEventListener('change', async (ev) => {
  const input = ev.target.closest('[data-toggle-id]');
  if (!input) return;
  const id = input.dataset.toggleId;
  input.disabled = true;
  try {
    await api.patch(`/api/equipe/${id}/toggle`, {});
    toast('Acesso atualizado.', 'success');
  } catch (err) {
    input.checked = !input.checked;
    toast(err.message || 'Erro ao atualizar acesso.', 'error');
  } finally {
    input.disabled = false;
  }
});

document.getElementById('equipe-body').addEventListener('click', async (ev) => {
  const btnReset = ev.target.closest('[data-reset-id]');
  if (!btnReset) return;
  const id = btnReset.dataset.resetId;
  const nome = btnReset.dataset.resetNome;
  const nova_senha = prompt(`Nova senha para ${nome} (mínimo 6 caracteres):`);
  if (!nova_senha) return;
  if (nova_senha.length < 6) { toast('Senha deve ter no mínimo 6 caracteres.', 'error'); return; }
  btnReset.disabled = true;
  try {
    await api.patch(`/api/equipe/${id}/senha`, { nova_senha });
    toast(`Senha de ${nome} redefinida com sucesso.`, 'success');
  } catch (err) {
    toast(err.message || 'Erro ao redefinir senha.', 'error');
  } finally {
    btnReset.disabled = false;
  }
});

const dialogMembro = document.getElementById('dialog-membro');
const formMembro = document.getElementById('form-membro');

document.getElementById('btn-novo-membro').addEventListener('click', () => {
  formMembro.reset();
  dialogMembro.showModal();
});
document.getElementById('btn-membro-cancel').addEventListener('click', () => dialogMembro.close());

formMembro.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const btnConfirm = document.getElementById('btn-membro-confirm');
  setBtnLoading(btnConfirm, 'Criando...');

  try {
    await api.post('/api/equipe', {
      nome: document.getElementById('membro-nome').value.trim(),
      email: document.getElementById('membro-email').value.trim(),
      senha: document.getElementById('membro-senha').value,
      role: document.getElementById('membro-role').value,
    });
    toast('Membro criado com sucesso!', 'success');
    dialogMembro.close();
    carregarEquipe();
  } catch (err) {
    toast(err.message || 'Erro ao criar membro.', 'error');
  } finally {
    resetBtnLoading(btnConfirm);
  }
});

carregarEquipe();
