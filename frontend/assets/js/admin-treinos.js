let treinosCache = [];
let exerciciosCache = [];
let treinoSelecionadoId = null;
let alunoSelecionadoId = null;

const GRUPOS_MUSCULARES = [
  'Peito', 'Costas', 'Ombro', 'Bíceps', 'Tríceps', 'Antebraço', 'Trapézio',
  'Quadríceps', 'Posterior de Coxa', 'Glúteos', 'Panturrilha', 'Abdômen', 'Lombar', 'Funcional',
];

/* ========== Carregar dados iniciais ========== */
async function init() {
  popularSelectsGrupoMuscular();
  await Promise.all([carregarTreinos(), carregarExercicios()]);
}

function popularSelectsGrupoMuscular() {
  const opcoes = GRUPOS_MUSCULARES.map((g) => `<option value="${g}">${g}</option>`).join('');
  document.getElementById('filtro-grupo-picker').insertAdjacentHTML('beforeend', opcoes);
  document.getElementById('exercicio-grupo-input').insertAdjacentHTML('beforeend', opcoes);
}

async function carregarTreinos() {
  const lista = document.getElementById('lista-treinos');
  try {
    // Reutiliza o endpoint do aluno mas busca todos via GET /api/treinos/meu
    // Para admin listamos via um endpoint geral — vamos usar uma query direta
    // O backend não tem GET /api/treinos (admin all), então usamos /api/alunos/dashboard
    // Na verdade o backend tem GET /api/treinos/meu (próprio aluno)
    // Vamos criar a lista buscando do próprio backend:
    // Como não tem endpoint admin de treinos, vamos usar uma abordagem diferente:
    // Guardar treinos criados localmente nesta sessão + buscar via indicação indireta.
    // MELHOR: adicionar GET /api/treinos (admin) no backend ← faremos isso
    const treinos = await api.get('/api/treinos');
    treinosCache = treinos;
    renderListaTreinos();
  } catch (err) {
    lista.innerHTML = '<div class="empty-state">Não foi possível carregar os treinos.</div>';
  }
}

async function carregarExercicios() {
  try {
    exerciciosCache = await api.get('/api/treinos/exercicios');
  } catch {
    exerciciosCache = [];
  }
}

function renderListaTreinos() {
  const lista = document.getElementById('lista-treinos');
  if (!treinosCache.length) {
    lista.innerHTML = '<div class="empty-state" style="font-size:.85rem">Nenhum treino ainda.<br>Clique em "Novo" para criar o primeiro.</div>';
    return;
  }
  lista.innerHTML = treinosCache.map((t) => `
    <div class="treino-item${treinoSelecionadoId === t.id ? ' selecionado' : ''}" data-treino-id="${t.id}">
      <div class="treino-item-info">
        <strong>${escapeHtml(t.nome)}</strong>
        <span>${escapeHtml(t.descricao || 'Sem descrição')}</span>
      </div>
      <span class="badge badge-muted">${(t.exercicios_count || 0)} ex.</span>
    </div>
  `).join('');
}

/* ========== Selecionar treino ========== */
document.getElementById('lista-treinos').addEventListener('click', async (ev) => {
  const item = ev.target.closest('[data-treino-id]');
  if (!item) return;
  const id = Number(item.dataset.treinoId);
  if (treinoSelecionadoId === id) return;
  treinoSelecionadoId = id;
  alunoSelecionadoId = null;
  renderListaTreinos();
  await carregarDetalheTreino(id);
});

async function carregarDetalheTreino(id) {
  const detalhe = document.getElementById('treino-detalhe');
  detalhe.style.display = 'block';
  document.getElementById('detalhe-nome').textContent = '...';
  document.getElementById('detalhe-desc').textContent = '';
  document.getElementById('detalhe-exercicios').innerHTML = '<div class="loading-row"><span class="spinner"></span></div>';
  document.getElementById('lista-alunos-treino').innerHTML = '';
  document.getElementById('btn-atribuir').disabled = true;
  document.getElementById('dia-semana-treino').value = '';

  try {
    const treino = treinosCache.find((t) => t.id === id);
    if (!treino) return;
    document.getElementById('detalhe-nome').textContent = treino.nome;
    document.getElementById('detalhe-desc').textContent = treino.descricao || '';

    const exercicios = treino.exercicios || [];
    const valid = exercicios.filter((e) => e && e.exercicio);
    document.getElementById('detalhe-exercicios').innerHTML = valid.length
      ? valid.map((te) => `
          <div class="row gap-sm" style="align-items:center;font-size:.83rem;padding:.45rem .6rem;background:var(--color-surface-2);border-radius:var(--radius-sm)">
            <span style="flex:1;font-weight:600">${escapeHtml(te.exercicio.nome)}</span>
            <span class="text-muted">${te.series}x${te.repeticoes}${te.carga ? ' · ' + te.carga + 'kg' : ''}</span>
          </div>
        `).join('')
      : '<div class="text-muted" style="font-size:.83rem">Sem exercícios cadastrados neste treino.</div>';
  } catch {
    document.getElementById('detalhe-exercicios').innerHTML = '<div class="empty-state">Erro ao carregar detalhes.</div>';
  }

  carregarAlunosParaAtribuir('');
}

document.getElementById('btn-fechar-detalhe').addEventListener('click', () => {
  treinoSelecionadoId = null;
  alunoSelecionadoId = null;
  document.getElementById('treino-detalhe').style.display = 'none';
  renderListaTreinos();
});

document.getElementById('btn-excluir-treino').addEventListener('click', async () => {
  const treino = treinosCache.find((t) => t.id === treinoSelecionadoId);
  if (!treino) return;
  const confirmado = await confirmDialog(`Excluir o treino "${treino.nome}"? Essa ação não pode ser desfeita.`, { titulo: 'Excluir treino', textoConfirmar: 'Excluir' });
  if (!confirmado) return;

  const btn = document.getElementById('btn-excluir-treino');
  setBtnLoading(btn, '');
  try {
    await api.del(`/api/treinos/${treino.id}`);
    treinosCache = treinosCache.filter((t) => t.id !== treino.id);
    treinoSelecionadoId = null;
    document.getElementById('treino-detalhe').style.display = 'none';
    renderListaTreinos();
    toast(`Treino "${treino.nome}" excluído.`, 'success');
  } catch (err) {
    toast(err.message || 'Erro ao excluir treino.', 'error');
    resetBtnLoading(btn);
  }
});

/* ========== Buscar alunos para atribuir ========== */
async function carregarAlunosParaAtribuir(busca) {
  const lista = document.getElementById('lista-alunos-treino');
  lista.innerHTML = '<div class="loading-row"><span class="spinner" style="width:18px;height:18px"></span></div>';
  try {
    const query = busca ? `?busca=${encodeURIComponent(busca)}` : '';
    const { alunos } = await api.get(`/api/admin/alunos${query}`);
    lista.innerHTML = alunos.length
      ? alunos.map((a) => `
          <div class="aluno-row-sel${alunoSelecionadoId === a.id ? ' selecionado' : ''}" data-aluno-id="${a.id}">
            <div class="ranking-avatar-row">
              <span class="avatar-fallback">${escapeHtml(iniciais(a.nome))}</span>
              <div><strong style="font-size:.85rem">${escapeHtml(a.nome)}</strong><div class="text-muted" style="font-size:.76rem">${escapeHtml(a.email)}</div></div>
            </div>
            <span class="badge ${a.ativo ? 'badge-success' : 'badge-muted'}" style="font-size:.72rem">${a.ativo ? 'Ativo' : 'Inativo'}</span>
          </div>
        `).join('')
      : '<div class="empty-state" style="font-size:.83rem">Nenhum aluno encontrado.</div>';
  } catch {
    lista.innerHTML = '<div class="empty-state" style="font-size:.83rem">Erro ao carregar alunos.</div>';
  }
}

document.getElementById('lista-alunos-treino').addEventListener('click', (ev) => {
  const row = ev.target.closest('[data-aluno-id]');
  if (!row) return;
  alunoSelecionadoId = Number(row.dataset.alunoId);
  document.querySelectorAll('.aluno-row-sel').forEach((r) =>
    r.classList.toggle('selecionado', Number(r.dataset.alunoId) === alunoSelecionadoId)
  );
  document.getElementById('btn-atribuir').disabled = false;
});

document.getElementById('busca-aluno-treino').addEventListener('input', debounce((ev) => {
  carregarAlunosParaAtribuir(ev.target.value.trim());
}, 350));

document.getElementById('btn-atribuir').addEventListener('click', async () => {
  if (!treinoSelecionadoId || !alunoSelecionadoId) return;
  const btn = document.getElementById('btn-atribuir');
  const diaSemanaInput = document.getElementById('dia-semana-treino').value;
  const dia_semana = diaSemanaInput === '' ? null : Number(diaSemanaInput);
  setBtnLoading(btn, 'Atribuindo...');
  try {
    await api.post(`/api/treinos/${treinoSelecionadoId}/atribuir/${alunoSelecionadoId}`, { dia_semana });
    const treino = treinosCache.find((t) => t.id === treinoSelecionadoId);
    const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
    const rotulo = dia_semana === null ? 'todo dia' : `toda ${DIAS[dia_semana]}`;
    toast(`Treino "${treino?.nome}" atribuído (${rotulo})!`, 'success');
    alunoSelecionadoId = null;
    document.getElementById('btn-atribuir').disabled = true;
    document.querySelectorAll('.aluno-row-sel.selecionado').forEach((r) => r.classList.remove('selecionado'));
  } catch (err) {
    toast(err.message || 'Erro ao atribuir treino.', 'error');
  } finally {
    resetBtnLoading(btn);
  }
});

/* ========== Criar novo treino ========== */
const dialogTreino = document.getElementById('dialog-treino');
let exerciciosForm = [];

document.getElementById('btn-novo-treino').addEventListener('click', () => {
  document.getElementById('form-treino').reset();
  exerciciosForm = [];
  renderExerciciosForm();
  dialogTreino.showModal();
});

document.getElementById('btn-treino-cancel').addEventListener('click', () => dialogTreino.close());

document.getElementById('btn-add-exercicio').addEventListener('click', () => {
  exerciciosForm.push({ exercicio_id: '', series: 3, repeticoes: 12, carga: '', descanso_segundos: 60 });
  renderExerciciosForm();
});

function exercicioThumb(ex) {
  return ex && ex.imagem_url
    ? `<span class="exercicio-thumb"><img src="${escapeHtml(ex.imagem_url)}" alt="" loading="lazy" decoding="async" /></span>`
    : `<span class="exercicio-thumb">${Icons.icon('dumbbell', { size: 16 })}</span>`;
}

function renderExerciciosForm() {
  const container = document.getElementById('exercicios-form-list');
  if (!exerciciosForm.length) {
    container.innerHTML = '<div class="text-muted" style="font-size:.82rem;padding:.4rem 0">Nenhum exercício adicionado ainda.</div>';
    return;
  }
  container.innerHTML = exerciciosForm.map((ex, i) => {
    const exercicio = exerciciosCache.find((e) => e.id === Number(ex.exercicio_id));
    return `
    <div class="exercicio-row-admin">
      <button type="button" class="exercicio-picker-btn${exercicio ? ' preenchido' : ''}" data-escolher-idx="${i}">
        ${exercicio ? exercicioThumb(exercicio) : `<span class="exercicio-thumb">${Icons.icon('dumbbell', { size: 16 })}</span>`}
        <span class="exercicio-picker-nome${exercicio ? '' : ' exercicio-picker-placeholder'}">${exercicio ? escapeHtml(exercicio.nome) : 'Escolher exercício...'}</span>
      </button>
      <input type="number" class="input" placeholder="Séries" value="${ex.series}" min="1" data-ex-idx="${i}" data-field="series" />
      <input type="number" class="input" placeholder="Reps" value="${ex.repeticoes}" min="1" data-ex-idx="${i}" data-field="repeticoes" />
      <input type="number" class="input" placeholder="Carga kg" value="${ex.carga || ''}" min="0" step="0.5" data-ex-idx="${i}" data-field="carga" />
      <input type="number" class="input" placeholder="Descanso s" value="${ex.descanso_segundos}" min="0" step="5" title="Descanso entre séries (segundos)" data-ex-idx="${i}" data-field="descanso_segundos" />
      <button type="button" class="btn btn-ghost btn-sm" data-remove-idx="${i}" title="Remover">
        ${Icons.icon('trash-2', { size: 13 })}
      </button>
    </div>
  `;
  }).join('');
}

document.getElementById('exercicios-form-list').addEventListener('change', (ev) => {
  const el = ev.target;
  const idx = Number(el.dataset.exIdx);
  const field = el.dataset.field;
  if (field === undefined || idx === undefined) return;
  exerciciosForm[idx][field] = el.value;
});

document.getElementById('exercicios-form-list').addEventListener('click', (ev) => {
  const removeBtn = ev.target.closest('[data-remove-idx]');
  if (removeBtn) {
    const idx = Number(removeBtn.dataset.removeIdx);
    exerciciosForm.splice(idx, 1);
    renderExerciciosForm();
    return;
  }
  const escolherBtn = ev.target.closest('[data-escolher-idx]');
  if (escolherBtn) {
    abrirPickerExercicio(Number(escolherBtn.dataset.escolherIdx));
  }
});

/* ========== Picker visual de exercício (grade com imagem) ========== */
const dialogPicker = document.getElementById('dialog-escolher-exercicio');
let pickerIdxAtual = null;

function abrirPickerExercicio(idx) {
  pickerIdxAtual = idx;
  document.getElementById('busca-exercicio-picker').value = '';
  document.getElementById('filtro-grupo-picker').value = '';
  renderPickerGrid('', '');
  dialogPicker.showModal();
}

function renderPickerGrid(busca, grupo) {
  const grid = document.getElementById('exercicio-picker-grid');
  const termo = busca.trim().toLowerCase();
  let filtrados = exerciciosCache;
  if (grupo) filtrados = filtrados.filter((e) => e.grupo_muscular === grupo);
  if (termo) filtrados = filtrados.filter((e) => e.nome.toLowerCase().includes(termo) || (e.grupo_muscular || '').toLowerCase().includes(termo));

  if (!filtrados.length) {
    grid.innerHTML = '<div class="text-muted" style="font-size:.85rem;padding:1rem 0">Nenhum exercício encontrado.</div>';
    return;
  }

  const selecionadoId = pickerIdxAtual !== null ? Number(exerciciosForm[pickerIdxAtual]?.exercicio_id) : null;
  grid.innerHTML = filtrados.map((e) => `
    <div class="exercicio-card${e.id === selecionadoId ? ' selecionado' : ''}" data-exercicio-id="${e.id}">
      ${e.video_url ? `<span class="video-badge">${Icons.icon('play', { size: 9 })}Vídeo</span>` : ''}
      ${exercicioThumb(e)}
      <strong>${escapeHtml(e.nome)}</strong>
      ${e.grupo_muscular ? `<span>${escapeHtml(e.grupo_muscular)}</span>` : ''}
    </div>
  `).join('');
}

function filtrosPickerAtuais() {
  return [
    document.getElementById('busca-exercicio-picker').value,
    document.getElementById('filtro-grupo-picker').value,
  ];
}

document.getElementById('busca-exercicio-picker').addEventListener('input', debounce((ev) => {
  renderPickerGrid(ev.target.value, document.getElementById('filtro-grupo-picker').value);
}, 250));

document.getElementById('filtro-grupo-picker').addEventListener('change', (ev) => {
  renderPickerGrid(document.getElementById('busca-exercicio-picker').value, ev.target.value);
});

document.getElementById('exercicio-picker-grid').addEventListener('click', (ev) => {
  const card = ev.target.closest('[data-exercicio-id]');
  if (!card || pickerIdxAtual === null) return;
  exerciciosForm[pickerIdxAtual].exercicio_id = card.dataset.exercicioId;
  dialogPicker.close();
  renderExerciciosForm();
});

document.getElementById('btn-escolher-exercicio-cancel').addEventListener('click', () => dialogPicker.close());

/* ========== Cadastrar novo exercício (imagem/vídeo) ========== */
const dialogExercicio = document.getElementById('dialog-exercicio');

document.getElementById('btn-novo-exercicio-inline').addEventListener('click', () => {
  document.getElementById('form-exercicio').reset();
  dialogExercicio.showModal();
});

document.getElementById('btn-exercicio-cancel').addEventListener('click', () => dialogExercicio.close());

document.getElementById('form-exercicio').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const btn = document.getElementById('btn-exercicio-confirm');
  setBtnLoading(btn, 'Salvando...');

  try {
    const novoExercicio = await api.post('/api/treinos/exercicios', {
      nome: document.getElementById('exercicio-nome-input').value.trim(),
      grupo_muscular: document.getElementById('exercicio-grupo-input').value.trim() || null,
      imagem_url: document.getElementById('exercicio-imagem-input').value.trim() || null,
      video_url: document.getElementById('exercicio-video-input').value.trim() || null,
    });
    exerciciosCache.push(novoExercicio);
    dialogExercicio.close();
    toast(`Exercício "${novoExercicio.nome}" cadastrado!`, 'success');
    renderPickerGrid(...filtrosPickerAtuais());
  } catch (err) {
    toast(err.message || 'Erro ao cadastrar exercício.', 'error');
  } finally {
    resetBtnLoading(btn);
  }
});

document.getElementById('form-treino').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const btn = document.getElementById('btn-treino-confirm');
  setBtnLoading(btn, 'Criando...');

  const nome = document.getElementById('treino-nome-input').value.trim();
  const descricao = document.getElementById('treino-desc-input').value.trim();
  const exercicios = exerciciosForm
    .filter((e) => e.exercicio_id)
    .map((e, i) => ({
      exercicio_id: Number(e.exercicio_id),
      series: Number(e.series) || 3,
      repeticoes: Number(e.repeticoes) || 12,
      carga: e.carga ? Number(e.carga) : null,
      descanso_segundos: Number(e.descanso_segundos) || 60,
    }));

  try {
    const treino = await api.post('/api/treinos', { nome, descricao, exercicios });
    toast(`Treino "${treino.nome}" criado!`, 'success');
    dialogTreino.close();
    await carregarTreinos();
  } catch (err) {
    toast(err.message || 'Erro ao criar treino.', 'error');
  } finally {
    resetBtnLoading(btn);
  }
});

init();
