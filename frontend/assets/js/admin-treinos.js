let treinosCache = [];
let exerciciosCache = [];
let treinoSelecionadoId = null;
let alunoSelecionadoId = null;

/* ========== Carregar dados iniciais ========== */
async function init() {
  await Promise.all([carregarTreinos(), carregarExercicios()]);
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
        <strong>${t.nome}</strong>
        <span>${t.descricao || 'Sem descrição'}</span>
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
            <span style="flex:1;font-weight:600">${te.exercicio.nome}</span>
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

/* ========== Buscar alunos para atribuir ========== */
async function carregarAlunosParaAtribuir(busca) {
  const lista = document.getElementById('lista-alunos-treino');
  lista.innerHTML = '<div class="loading-row"><span class="spinner" style="width:18px;height:18px"></span></div>';
  try {
    const query = busca ? `?busca=${encodeURIComponent(busca)}` : '';
    const alunos = await api.get(`/api/admin/alunos${query}`);
    lista.innerHTML = alunos.length
      ? alunos.map((a) => `
          <div class="aluno-row-sel${alunoSelecionadoId === a.id ? ' selecionado' : ''}" data-aluno-id="${a.id}">
            <div class="ranking-avatar-row">
              <span class="avatar-fallback">${iniciais(a.nome)}</span>
              <div><strong style="font-size:.85rem">${a.nome}</strong><div class="text-muted" style="font-size:.76rem">${a.email}</div></div>
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
  setBtnLoading(btn, 'Atribuindo...');
  try {
    await api.post(`/api/treinos/${treinoSelecionadoId}/atribuir/${alunoSelecionadoId}`, {});
    const treino = treinosCache.find((t) => t.id === treinoSelecionadoId);
    toast(`Treino "${treino?.nome}" atribuído com sucesso!`, 'success');
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

function renderExerciciosForm() {
  const container = document.getElementById('exercicios-form-list');
  if (!exerciciosForm.length) {
    container.innerHTML = '<div class="text-muted" style="font-size:.82rem;padding:.4rem 0">Nenhum exercício adicionado ainda.</div>';
    return;
  }
  const opts = exerciciosCache.map((e) => `<option value="${e.id}">${e.nome}${e.grupo_muscular ? ' (' + e.grupo_muscular + ')' : ''}</option>`).join('');
  container.innerHTML = exerciciosForm.map((ex, i) => `
    <div class="exercicio-row-admin">
      <select data-ex-idx="${i}" data-field="exercicio_id" class="input">
        <option value="">— Exercício —</option>
        ${opts}
      </select>
      <input type="number" class="input" placeholder="Séries" value="${ex.series}" min="1" data-ex-idx="${i}" data-field="series" />
      <input type="number" class="input" placeholder="Reps" value="${ex.repeticoes}" min="1" data-ex-idx="${i}" data-field="repeticoes" />
      <input type="number" class="input" placeholder="Carga kg" value="${ex.carga || ''}" min="0" step="0.5" data-ex-idx="${i}" data-field="carga" />
      <button type="button" class="btn btn-ghost btn-sm" data-remove-idx="${i}" title="Remover">
        ${Icons.icon('trash-2', { size: 13 })}
      </button>
    </div>
  `).join('');

  // Preencher selects com valor atual
  exerciciosForm.forEach((ex, i) => {
    const sel = container.querySelector(`select[data-ex-idx="${i}"]`);
    if (sel && ex.exercicio_id) sel.value = ex.exercicio_id;
  });
}

document.getElementById('exercicios-form-list').addEventListener('change', (ev) => {
  const el = ev.target;
  const idx = Number(el.dataset.exIdx);
  const field = el.dataset.field;
  if (field === undefined || idx === undefined) return;
  exerciciosForm[idx][field] = el.value;
});

document.getElementById('exercicios-form-list').addEventListener('click', (ev) => {
  const btn = ev.target.closest('[data-remove-idx]');
  if (!btn) return;
  const idx = Number(btn.dataset.removeIdx);
  exerciciosForm.splice(idx, 1);
  renderExerciciosForm();
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
