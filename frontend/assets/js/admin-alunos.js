let planosCache = null;

async function carregarPlanos() {
  if (planosCache) return planosCache;
  planosCache = await api.get('/api/planos');
  return planosCache;
}

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
            <td>${a.plano_nome || '-'}</td>
            <td>${formatData(a.data_vencimento)}</td>
            <td>${a.xp}</td>
            <td>${a.sequencia_atual} dias</td>
            <td><span class="badge ${a.ativo ? 'badge-success' : 'badge-muted'}">${Icons.icon(a.ativo ? 'unlock' : 'lock', { size: 12 })}${a.ativo ? 'Liberado' : 'Bloqueado'}</span></td>
            <td style="display:flex;gap:.4rem;align-items:center">
              <label class="switch" title="Liberar/Bloquear acesso à academia (catraca)">
                <input type="checkbox" data-toggle-id="${a.id}" ${a.ativo ? 'checked' : ''} />
                <span class="slider"></span>
              </label>
              <button class="btn btn-ghost btn-sm" data-mat-id="${a.id}" data-mat-nome="${a.nome}"
                data-mat-matricula-id="${a.matricula_id || ''}"
                title="${a.matricula_status === 'ativa' ? 'Renovar matrícula' : 'Matricular'}">
                ${a.matricula_status === 'ativa' ? Icons.icon('refresh-cw', { size: 14 }) : Icons.icon('user-plus', { size: 14 })}
              </button>
              <button class="btn btn-ghost btn-sm" data-reset-id="${a.id}" data-reset-nome="${a.nome}" title="Redefinir senha">
                ${Icons.icon('key', { size: 14 })}
              </button>
              <button class="btn btn-ghost btn-sm" data-catraca-id="${a.id}" data-catraca-nome="${a.nome}" data-catraca-valor="${a.controlid_user_id || ''}"
                title="${a.controlid_user_id ? `Vinculado à catraca (ID ${a.controlid_user_id})` : 'Vincular à catraca (reconhecimento facial)'}"
                style="${a.controlid_user_id ? 'color:var(--color-success)' : ''}">
                ${Icons.icon('shield-check', { size: 14 })}
              </button>
            </td>
          </tr>
        `).join('')
      : '<tr><td colspan="7" class="empty-state">Nenhum aluno encontrado.</td></tr>';
  } catch (err) {
    body.innerHTML = '<tr><td colspan="7" class="empty-state">Não foi possível carregar os alunos.</td></tr>';
  }
}

// Toggle ativo/inativo
document.getElementById('alunos-body').addEventListener('change', async (ev) => {
  const input = ev.target.closest('[data-toggle-id]');
  if (!input) return;
  const id = input.dataset.toggleId;
  input.disabled = true;
  try {
    const aluno = await api.patch(`/api/admin/alunos/${id}/toggle`, {});
    toast(aluno.ativo ? 'Acesso à academia liberado.' : 'Acesso à academia bloqueado.', 'success');
  } catch (err) {
    input.checked = !input.checked;
    toast(err.message || 'Erro ao atualizar acesso.', 'error');
  } finally {
    input.disabled = false;
  }
});

// Clicks na tabela (reset senha + matricular/renovar)
document.getElementById('alunos-body').addEventListener('click', async (ev) => {
  // Redefinir senha
  const btnReset = ev.target.closest('[data-reset-id]');
  if (btnReset) {
    const id = btnReset.dataset.resetId;
    const nome = btnReset.dataset.resetNome;
    const nova_senha = prompt(`Nova senha para ${nome} (mínimo 6 caracteres):`);
    if (!nova_senha) return;
    if (nova_senha.length < 6) { toast('Senha deve ter no mínimo 6 caracteres.', 'error'); return; }
    btnReset.disabled = true;
    try {
      await api.patch(`/api/admin/alunos/${id}/senha`, { nova_senha });
      toast(`Senha de ${nome} redefinida com sucesso.`, 'success');
    } catch (err) {
      toast(err.message || 'Erro ao redefinir senha.', 'error');
    } finally {
      btnReset.disabled = false;
    }
    return;
  }

  // Matricular / Renovar
  const btnMat = ev.target.closest('[data-mat-id]');
  if (btnMat) {
    await abrirDialogMatricula(btnMat);
    return;
  }

  // Vincular ID da catraca (Control iD)
  const btnCatraca = ev.target.closest('[data-catraca-id]');
  if (btnCatraca) {
    const id = btnCatraca.dataset.catracaId;
    const nome = btnCatraca.dataset.catracaNome;
    const valorAtual = btnCatraca.dataset.catracaValor;
    const novoValor = prompt(
      `ID do aluno no Control iD (catraca) para ${nome}:\nDeixe em branco para desvincular.`,
      valorAtual
    );
    if (novoValor === null) return;
    btnCatraca.disabled = true;
    try {
      await api.patch(`/api/admin/alunos/${id}/catraca`, { controlid_user_id: novoValor.trim() || null });
      toast(novoValor.trim() ? `${nome} vinculado à catraca.` : `${nome} desvinculado da catraca.`, 'success');
      carregarAlunos(document.getElementById('busca-aluno').value.trim());
    } catch (err) {
      toast(err.message || 'Erro ao vincular catraca.', 'error');
    } finally {
      btnCatraca.disabled = false;
    }
  }
});

// Dialog matricula
const dialog = document.getElementById('dialog-matricula');
const formMat = document.getElementById('form-matricula');
const selPlano = document.getElementById('mat-plano');
const selMetodo = document.getElementById('mat-metodo');
const inputUsuarioId = document.getElementById('mat-usuario-id');
const inputMatriculaId = document.getElementById('mat-matricula-id');

document.getElementById('btn-dialog-cancel').addEventListener('click', () => dialog.close());

async function abrirDialogMatricula(btn) {
  const usuarioId = btn.dataset.matId;
  const nome = btn.dataset.matNome;
  const matriculaId = btn.dataset.matMatriculaId || '';

  document.getElementById('dialog-titulo').textContent = matriculaId
    ? `Renovar matrícula: ${nome}`
    : `Matricular: ${nome}`;

  inputUsuarioId.value = usuarioId;
  inputMatriculaId.value = matriculaId;
  selMetodo.value = '';

  try {
    const planos = await carregarPlanos();
    selPlano.innerHTML = planos.map((p) => `<option value="${p.id}">${p.nome} (${formatMoeda(p.preco_mensal)}/mês)</option>`).join('');
  } catch {
    toast('Erro ao carregar planos.', 'error');
    return;
  }

  dialog.showModal();
}

formMat.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const btnConfirm = document.getElementById('btn-dialog-confirm');
  btnConfirm.disabled = true;
  btnConfirm.textContent = 'Salvando...';

  const usuarioId = inputUsuarioId.value;
  const matriculaId = inputMatriculaId.value;
  const plano_id = selPlano.value;
  const metodo_pagamento = selMetodo.value || undefined;

  try {
    if (matriculaId) {
      await api.patch(`/api/admin/matriculas/${matriculaId}/renovar`, { plano_id, metodo_pagamento });
      toast('Matrícula renovada com sucesso!', 'success');
    } else {
      await api.post('/api/admin/matriculas', { usuario_id: usuarioId, plano_id, metodo_pagamento });
      toast('Aluno matriculado com sucesso!', 'success');
    }
    dialog.close();
    carregarAlunos(document.getElementById('busca-aluno').value.trim());
  } catch (err) {
    toast(err.message || 'Erro ao salvar matrícula.', 'error');
  } finally {
    btnConfirm.disabled = false;
    btnConfirm.textContent = 'Confirmar';
  }
});

document.getElementById('busca-aluno').addEventListener('input', debounce((ev) => {
  carregarAlunos(ev.target.value.trim());
}));

carregarAlunos();
