async function carregarAlunos(busca = '') {
  const body = document.getElementById('alunos-body');
  body.innerHTML = '<tr><td colspan="7" class="loading-row"><span class="spinner"></span></td></tr>';

  try {
    const query = busca ? `?busca=${encodeURIComponent(busca)}` : '';
    const alunos = await api.get(`/api/admin/alunos${query}`);

    body.innerHTML = alunos.length
      ? alunos.map((a) => `
          <tr>
            <td>
              <div class="ranking-avatar-row">
                <span class="avatar-fallback">${iniciais(a.nome)}</span>
                <div><strong>${a.nome}</strong><div class="text-muted" style="font-size:.78rem">${a.email}</div></div>
              </div>
            </td>
            <td>${a.plano_nome || '—'}</td>
            <td>${formatData(a.data_vencimento)}</td>
            <td>${a.xp}</td>
            <td>${a.sequencia_atual} dias</td>
            <td><span class="badge ${a.ativo ? 'badge-success' : 'badge-muted'}">${a.ativo ? 'Ativo' : 'Inativo'}</span></td>
            <td style="display:flex;gap:.5rem;align-items:center">
              <label class="switch">
                <input type="checkbox" data-toggle-id="${a.id}" ${a.ativo ? 'checked' : ''} />
                <span class="slider"></span>
              </label>
              <button class="btn btn-ghost btn-sm" data-reset-id="${a.id}" data-reset-nome="${a.nome}" title="Redefinir senha">
                ${Icons.icon('key', { size: 14 })}
              </button>
            </td>
          </tr>
        `).join('')
      : '<tr><td colspan="7" class="empty-state">Nenhum aluno encontrado.</td></tr>';
  } catch (err) {
    body.innerHTML = '<tr><td colspan="7" class="empty-state">Não foi possível carregar os alunos.</td></tr>';
  }
}

document.getElementById('alunos-body').addEventListener('change', async (ev) => {
  const input = ev.target.closest('[data-toggle-id]');
  if (!input) return;
  const id = input.dataset.toggleId;
  input.disabled = true;
  try {
    await api.patch(`/api/admin/alunos/${id}/toggle`, {});
    toast('Status atualizado.', 'success');
  } catch (err) {
    input.checked = !input.checked;
    toast(err.message || 'Erro ao atualizar status.', 'error');
  } finally {
    input.disabled = false;
  }
});

document.getElementById('alunos-body').addEventListener('click', async (ev) => {
  const btn = ev.target.closest('[data-reset-id]');
  if (!btn) return;
  const id = btn.dataset.resetId;
  const nome = btn.dataset.resetNome;
  const nova_senha = prompt(`Nova senha para ${nome} (mínimo 6 caracteres):`);
  if (!nova_senha) return;
  if (nova_senha.length < 6) { toast('Senha deve ter no mínimo 6 caracteres.', 'error'); return; }
  btn.disabled = true;
  try {
    await api.patch(`/api/admin/alunos/${id}/senha`, { nova_senha });
    toast(`Senha de ${nome} redefinida com sucesso.`, 'success');
  } catch (err) {
    toast(err.message || 'Erro ao redefinir senha.', 'error');
  } finally {
    btn.disabled = false;
  }
});

document.getElementById('busca-aluno').addEventListener('input', debounce((ev) => {
  carregarAlunos(ev.target.value.trim());
}));

carregarAlunos();
