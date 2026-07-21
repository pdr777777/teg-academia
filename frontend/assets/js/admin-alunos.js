let planosCache = null;
const ALUNOS_POR_PAGINA = 30;
let paginaAtual = 1;

// Origem externa: aluno que entra pela academia mas não tem matrícula cobrada
// direto pela TEG (Gympass/Totalpass, personal, parceria, convênio...) — vem
// do import da base antiga da CloudGym. Mostra como badge no lugar do plano.
const LABELS_ORIGEM_EXTERNA = {
  gympass_totalpass: 'Gympass/Totalpass',
};

function labelOrigemExterna(origem) {
  if (LABELS_ORIGEM_EXTERNA[origem]) return LABELS_ORIGEM_EXTERNA[origem];
  return origem.charAt(0).toUpperCase() + origem.slice(1).toLowerCase();
}

async function carregarPlanos() {
  if (planosCache) return planosCache;
  planosCache = await api.get('/api/planos');
  return planosCache;
}

function renderPaginacao(total, page, limit) {
  const nav = document.getElementById('alunos-paginacao');
  if (!nav) return;
  const totalPaginas = Math.max(Math.ceil(total / limit), 1);
  if (total === 0) { nav.innerHTML = ''; return; }

  const inicio = (page - 1) * limit + 1;
  const fim = Math.min(page * limit, total);
  nav.innerHTML = `
    <span class="text-muted" style="font-size:.83rem">Mostrando ${inicio}–${fim} de ${total} alunos</span>
    <div style="display:flex;gap:.4rem;align-items:center">
      <button class="btn btn-ghost btn-sm" id="btn-pagina-anterior" ${page <= 1 ? 'disabled' : ''}>Anterior</button>
      <span class="text-muted" style="font-size:.83rem">Página ${page} de ${totalPaginas}</span>
      <button class="btn btn-ghost btn-sm" id="btn-pagina-proxima" ${page >= totalPaginas ? 'disabled' : ''}>Próxima</button>
    </div>
  `;
  document.getElementById('btn-pagina-anterior')?.addEventListener('click', () => {
    paginaAtual--;
    carregarAlunos(document.getElementById('busca-aluno').value.trim(), paginaAtual);
  });
  document.getElementById('btn-pagina-proxima')?.addEventListener('click', () => {
    paginaAtual++;
    carregarAlunos(document.getElementById('busca-aluno').value.trim(), paginaAtual);
  });
}

async function carregarAlunos(busca = '', page = 1) {
  paginaAtual = page;
  const body = document.getElementById('alunos-body');
  body.innerHTML = '<tr><td colspan="7" class="loading-row"><span class="spinner"></span></td></tr>';

  try {
    const params = new URLSearchParams({ page, limit: ALUNOS_POR_PAGINA });
    if (busca) params.set('busca', busca);
    const { alunos, total, limit } = await api.get(`/api/admin/alunos?${params}`);
    renderPaginacao(total, page, limit);

    body.innerHTML = alunos.length
      ? alunos.map((a) => `
          <tr>
            <td>
              <div class="ranking-avatar-row">
                <span class="avatar-fallback">${escapeHtml(iniciais(a.nome))}</span>
                <div><strong>${escapeHtml(a.nome)}</strong><div class="text-muted" style="font-size:.78rem">${escapeHtml(a.email)}</div></div>
              </div>
            </td>
            <td>${a.plano_nome ? escapeHtml(a.plano_nome) : (a.origem_externa ? `<span class="badge badge-primary">${escapeHtml(labelOrigemExterna(a.origem_externa))}</span>` : '-')}</td>
            <td>${formatData(a.data_vencimento)}</td>
            <td>${a.xp}</td>
            <td>${a.sequencia_atual} dias</td>
            <td><span class="badge ${a.ativo ? 'badge-success' : 'badge-muted'}">${Icons.icon(a.ativo ? 'unlock' : 'lock', { size: 12 })}${a.ativo ? 'Liberado' : 'Bloqueado'}</span></td>
            <td style="display:flex;gap:.4rem;align-items:center">
              <label class="switch" title="Liberar/Bloquear acesso à academia (catraca)">
                <input type="checkbox" data-toggle-id="${a.id}" ${a.ativo ? 'checked' : ''} />
                <span class="slider"></span>
              </label>
              <button class="btn btn-ghost btn-sm" data-mat-id="${a.id}" data-mat-nome="${escapeHtml(a.nome)}"
                data-mat-matricula-id="${a.matricula_id || ''}"
                title="${a.matricula_status === 'ativa' ? 'Renovar matrícula' : 'Matricular'}">
                ${a.matricula_status === 'ativa' ? Icons.icon('refresh-cw', { size: 14 }) : Icons.icon('user-plus', { size: 14 })}
              </button>
              <button class="btn btn-ghost btn-sm" data-reset-id="${a.id}" data-reset-nome="${escapeHtml(a.nome)}" title="Redefinir senha">
                ${Icons.icon('key', { size: 14 })}
              </button>
              <button class="btn btn-ghost btn-sm" data-catraca-id="${a.id}" data-catraca-nome="${escapeHtml(a.nome)}" data-catraca-valor="${escapeHtml(a.controlid_user_id || '')}"
                title="${a.controlid_user_id ? `Vinculado à catraca (ID ${escapeHtml(a.controlid_user_id)})` : 'Vincular à catraca (reconhecimento facial)'}"
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
    await abrirDialogMatricula(btnMat.dataset.matId, btnMat.dataset.matNome, btnMat.dataset.matMatriculaId || '');
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
      carregarAlunos(document.getElementById('busca-aluno').value.trim(), paginaAtual);
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

async function abrirDialogMatricula(usuarioId, nome, matriculaId = '') {
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
    carregarAlunos(document.getElementById('busca-aluno').value.trim(), paginaAtual);
  } catch (err) {
    toast(err.message || 'Erro ao salvar matrícula.', 'error');
  } finally {
    btnConfirm.disabled = false;
    btnConfirm.textContent = 'Confirmar';
  }
});

document.getElementById('busca-aluno').addEventListener('input', debounce((ev) => {
  carregarAlunos(ev.target.value.trim(), 1);
}));

carregarAlunos();

// Math.random() não é seguro pra gerar senha (previsível/reproduzível) —
// usa o CSPRNG do navegador. O viés de módulo aqui é desprezível pro
// tamanho desses alfabetos, não compensa a complexidade de rejection sampling.
function caractereAleatorio(alfabeto) {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return alfabeto[buf[0] % alfabeto.length];
}

function gerarSenhaTemp() {
  const letras = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz';
  const numeros = '23456789';
  let senha = '';
  for (let i = 0; i < 6; i++) senha += caractereAleatorio(letras);
  for (let i = 0; i < 4; i++) senha += caractereAleatorio(numeros);
  return senha;
}

const dialogNovoCliente = document.getElementById('dialog-novo-cliente');
const formNovoCliente = document.getElementById('form-novo-cliente');
const inputNcNome = document.getElementById('nc-nome');
const inputNcEmail = document.getElementById('nc-email');
const inputNcTelefone = document.getElementById('nc-telefone');
const inputNcSenha = document.getElementById('nc-senha');

document.getElementById('btn-novo-cliente').addEventListener('click', () => {
  formNovoCliente.reset();
  inputNcSenha.value = gerarSenhaTemp();
  dialogNovoCliente.showModal();
});

document.getElementById('btn-nc-cancel').addEventListener('click', () => dialogNovoCliente.close());

document.getElementById('btn-nc-copiar-senha').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(inputNcSenha.value);
    toast('Senha copiada.', 'success');
  } catch {
    toast('Não foi possível copiar. Copie manualmente.', 'error');
  }
});

formNovoCliente.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const btnConfirm = document.getElementById('btn-nc-confirm');
  btnConfirm.disabled = true;
  btnConfirm.textContent = 'Cadastrando...';

  try {
    const { user } = await api.post('/api/auth/registro', {
      nome: inputNcNome.value.trim(),
      email: inputNcEmail.value.trim(),
      senha: inputNcSenha.value,
      telefone: inputNcTelefone.value.trim(),
    });
    dialogNovoCliente.close();
    toast(`${user.nome} cadastrado! Agora escolha o plano.`, 'success');
    await abrirDialogMatricula(user.id, user.nome, '');
  } catch (err) {
    toast(err.message || 'Erro ao cadastrar cliente.', 'error');
  } finally {
    btnConfirm.disabled = false;
    btnConfirm.textContent = 'Cadastrar e matricular';
  }
});

// ===== Adicionar aluno (assistente com verificação facial) =====
const dialogAdicionarAluno = document.getElementById('dialog-adicionar-aluno');
const formAdicionarAluno = document.getElementById('form-adicionar-aluno');
const inputAaNome = document.getElementById('aa-nome');
const inputAaEmail = document.getElementById('aa-email');
const inputAaTelefone = document.getElementById('aa-telefone');
const inputAaSenha = document.getElementById('aa-senha');
const selAaPlano = document.getElementById('aa-plano');
const selAaMetodo = document.getElementById('aa-metodo');
const inputAaPresencial = document.getElementById('aa-presencial');
const labelAaPresencial = document.getElementById('aa-presencial-label');
const painelAaFacial = document.getElementById('aa-facial-painel');
const statusAaFacial = document.getElementById('aa-facial-status');

let aaUsuarioId = null;

function aaIrParaPasso(passo) {
  document.querySelectorAll('[data-wizard-step]').forEach((el) => {
    el.classList.toggle('active', el.dataset.wizardStep === passo);
  });
  document.querySelectorAll('[data-wizard-section]').forEach((el) => {
    el.style.display = el.dataset.wizardSection === passo ? '' : 'none';
  });
}

document.getElementById('btn-adicionar-aluno').addEventListener('click', () => {
  formAdicionarAluno.reset();
  aaUsuarioId = null;
  inputAaSenha.value = gerarSenhaTemp();
  painelAaFacial.style.display = 'none';
  statusAaFacial.textContent = '';
  labelAaPresencial.textContent = 'Não é presencial';
  aaIrParaPasso('dados');
  dialogAdicionarAluno.showModal();
});

document.getElementById('btn-aa-copiar-senha').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(inputAaSenha.value);
    toast('Senha copiada.', 'success');
  } catch {
    toast('Não foi possível copiar. Copie manualmente.', 'error');
  }
});

document.getElementById('btn-aa-cancel-1').addEventListener('click', () => dialogAdicionarAluno.close());
document.getElementById('btn-aa-cancel-2').addEventListener('click', () => dialogAdicionarAluno.close());

document.getElementById('btn-aa-avancar-dados').addEventListener('click', async (ev) => {
  const btn = ev.currentTarget;
  if (!inputAaNome.value.trim() || !inputAaEmail.value.trim()) {
    toast('Preencha nome e e-mail.', 'error');
    return;
  }
  btn.disabled = true;
  btn.textContent = 'Cadastrando...';
  try {
    const { user } = await api.post('/api/auth/registro', {
      nome: inputAaNome.value.trim(),
      email: inputAaEmail.value.trim(),
      senha: inputAaSenha.value,
      telefone: inputAaTelefone.value.trim(),
    });
    aaUsuarioId = user.id;

    const planos = await carregarPlanos();
    selAaPlano.innerHTML = planos.map((p) => `<option value="${p.id}">${p.nome} (${formatMoeda(p.preco_mensal)}/mês)</option>`).join('');
    selAaMetodo.value = '';

    aaIrParaPasso('plano');
  } catch (err) {
    toast(err.message || 'Erro ao cadastrar aluno.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Avançar';
  }
});

document.getElementById('btn-aa-avancar-plano').addEventListener('click', async (ev) => {
  const btn = ev.currentTarget;
  btn.disabled = true;
  btn.textContent = 'Salvando...';
  try {
    await api.post('/api/admin/matriculas', {
      usuario_id: aaUsuarioId,
      plano_id: selAaPlano.value,
      metodo_pagamento: selAaMetodo.value || undefined,
    });

    inputAaPresencial.checked = false;
    labelAaPresencial.textContent = 'Não é presencial';
    painelAaFacial.style.display = 'none';
    statusAaFacial.textContent = '';

    aaIrParaPasso('facial');
  } catch (err) {
    toast(err.message || 'Erro ao matricular aluno.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Avançar';
  }
});

inputAaPresencial.addEventListener('change', () => {
  painelAaFacial.style.display = inputAaPresencial.checked ? '' : 'none';
  labelAaPresencial.textContent = inputAaPresencial.checked ? 'Presencial' : 'Não é presencial';
});

document.getElementById('btn-aa-verificar-rosto').addEventListener('click', async (ev) => {
  const btn = ev.currentTarget;
  btn.disabled = true;
  statusAaFacial.textContent = 'Verificando...';
  try {
    const { resultados } = await api.post(`/api/catraca/${aaUsuarioId}/verificar-rosto`, {});
    const encontrou = resultados.some((r) => r.encontrado);
    statusAaFacial.textContent = encontrou
      ? 'Rosto cadastrado com sucesso!'
      : 'Ainda não encontramos o cadastro — cadastre o rosto no equipamento e tente de novo.';
  } catch (err) {
    statusAaFacial.textContent = err.message || 'Erro ao verificar cadastro.';
  } finally {
    btn.disabled = false;
  }
});

formAdicionarAluno.addEventListener('submit', (ev) => {
  ev.preventDefault();
  dialogAdicionarAluno.close();
  toast('Aluno adicionado com sucesso!', 'success');
  carregarAlunos(document.getElementById('busca-aluno').value.trim(), paginaAtual);
});
