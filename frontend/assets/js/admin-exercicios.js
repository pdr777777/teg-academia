let exerciciosCache = [];
let exercicioEditandoId = null;

const GRUPOS_MUSCULARES = [
  'Peito', 'Costas', 'Ombro', 'Bíceps', 'Tríceps', 'Antebraço', 'Trapézio',
  'Quadríceps', 'Posterior de Coxa', 'Glúteos', 'Panturrilha', 'Abdômen', 'Lombar', 'Funcional',
];

function popularSelectsGrupoMuscular() {
  const opcoes = GRUPOS_MUSCULARES.map((g) => `<option value="${g}">${g}</option>`).join('');
  document.getElementById('filtro-grupo-lib').insertAdjacentHTML('beforeend', opcoes);
  document.getElementById('exercicio-grupo-input').insertAdjacentHTML('beforeend', opcoes);
}

function exercicioThumb(ex) {
  return ex.imagem_url
    ? `<span class="exercicio-thumb"><img src="${escapeHtml(ex.imagem_url)}" alt="" loading="lazy" decoding="async" /></span>`
    : `<span class="exercicio-thumb">${Icons.icon('dumbbell', { size: 20 })}</span>`;
}

async function carregarExercicios() {
  try {
    exerciciosCache = await api.get('/api/treinos/exercicios');
    renderGrid();
  } catch (err) {
    document.getElementById('exercicio-lib-grid').innerHTML = '<div class="empty-state">Não foi possível carregar os exercícios.</div>';
  }
}

function filtrosAtuais() {
  return [
    document.getElementById('busca-exercicio-lib').value,
    document.getElementById('filtro-grupo-lib').value,
  ];
}

function renderGrid() {
  const [busca, grupo] = filtrosAtuais();
  const grid = document.getElementById('exercicio-lib-grid');
  const termo = busca.trim().toLowerCase();

  let filtrados = exerciciosCache;
  if (grupo) filtrados = filtrados.filter((e) => e.grupo_muscular === grupo);
  if (termo) filtrados = filtrados.filter((e) => e.nome.toLowerCase().includes(termo) || (e.grupo_muscular || '').toLowerCase().includes(termo));

  if (!filtrados.length) {
    grid.innerHTML = exerciciosCache.length
      ? '<div class="empty-state" style="grid-column:1/-1">Nenhum exercício encontrado.</div>'
      : '<div class="empty-state" style="grid-column:1/-1">Nenhum exercício ainda.<br>Clique em "Novo" para cadastrar o primeiro.</div>';
    return;
  }

  grid.innerHTML = filtrados.map((e) => `
    <div class="exercicio-lib-card" data-exercicio-id="${e.id}">
      ${exercicioThumb(e)}
      <strong>${escapeHtml(e.nome)}</strong>
      ${e.grupo_muscular ? `<span class="badge badge-muted">${escapeHtml(e.grupo_muscular)}</span>` : ''}
      <div class="exercicio-lib-actions">
        <button type="button" class="btn btn-ghost btn-sm" data-editar-id="${e.id}" title="Editar">${Icons.icon('edit', { size: 14 })}</button>
        <button type="button" class="btn btn-ghost btn-sm" data-excluir-id="${e.id}" title="Excluir">${Icons.icon('trash', { size: 14 })}</button>
      </div>
    </div>
  `).join('');
}

document.getElementById('busca-exercicio-lib').addEventListener('input', debounce(renderGrid, 250));
document.getElementById('filtro-grupo-lib').addEventListener('change', renderGrid);

/* ========== Criar / editar exercício ========== */
const dialogExercicio = document.getElementById('dialog-exercicio');

function abrirDialogExercicio(exercicio) {
  exercicioEditandoId = exercicio ? exercicio.id : null;
  document.getElementById('form-exercicio').reset();
  document.getElementById('exercicio-dialog-titulo').textContent = exercicio ? 'Editar exercício' : 'Novo exercício';
  document.getElementById('exercicio-nome-input').value = exercicio?.nome || '';
  document.getElementById('exercicio-grupo-input').value = exercicio?.grupo_muscular || '';
  document.getElementById('exercicio-imagem-input').value = exercicio?.imagem_url || '';
  document.getElementById('exercicio-video-input').value = exercicio?.video_url || '';
  dialogExercicio.showModal();
}

document.getElementById('btn-novo-exercicio').addEventListener('click', () => abrirDialogExercicio(null));
document.getElementById('btn-exercicio-cancel').addEventListener('click', () => dialogExercicio.close());

document.getElementById('form-exercicio').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const btn = document.getElementById('btn-exercicio-confirm');
  setBtnLoading(btn, 'Salvando...');

  const payload = {
    nome: document.getElementById('exercicio-nome-input').value.trim(),
    grupo_muscular: document.getElementById('exercicio-grupo-input').value.trim() || null,
    imagem_url: document.getElementById('exercicio-imagem-input').value.trim() || null,
    video_url: document.getElementById('exercicio-video-input').value.trim() || null,
  };

  try {
    if (exercicioEditandoId) {
      const atualizado = await api.put(`/api/treinos/exercicios/${exercicioEditandoId}`, payload);
      exerciciosCache = exerciciosCache.map((e) => (e.id === atualizado.id ? atualizado : e));
      toast(`Exercício "${atualizado.nome}" atualizado!`, 'success');
    } else {
      const novo = await api.post('/api/treinos/exercicios', payload);
      exerciciosCache.push(novo);
      toast(`Exercício "${novo.nome}" cadastrado!`, 'success');
    }
    dialogExercicio.close();
    renderGrid();
  } catch (err) {
    toast(err.message || 'Erro ao salvar exercício.', 'error');
  } finally {
    resetBtnLoading(btn);
  }
});

/* ========== Excluir exercício ========== */
document.getElementById('exercicio-lib-grid').addEventListener('click', async (ev) => {
  const editarBtn = ev.target.closest('[data-editar-id]');
  if (editarBtn) {
    const exercicio = exerciciosCache.find((e) => e.id === Number(editarBtn.dataset.editarId));
    if (exercicio) abrirDialogExercicio(exercicio);
    return;
  }

  const excluirBtn = ev.target.closest('[data-excluir-id]');
  if (excluirBtn) {
    const exercicio = exerciciosCache.find((e) => e.id === Number(excluirBtn.dataset.excluirId));
    if (!exercicio) return;
    const confirmado = await confirmDialog(`Excluir o exercício "${exercicio.nome}"? Essa ação não pode ser desfeita.`, { titulo: 'Excluir exercício', textoConfirmar: 'Excluir' });
    if (!confirmado) return;

    setBtnLoading(excluirBtn, '');
    try {
      await api.del(`/api/treinos/exercicios/${exercicio.id}`);
      exerciciosCache = exerciciosCache.filter((e) => e.id !== exercicio.id);
      renderGrid();
      toast(`Exercício "${exercicio.nome}" excluído.`, 'success');
    } catch (err) {
      toast(err.message || 'Erro ao excluir exercício.', 'error');
      resetBtnLoading(excluirBtn);
    }
  }
});

popularSelectsGrupoMuscular();
carregarExercicios();
