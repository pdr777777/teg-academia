let professoresCache = null;
let aulasCache = [];

function hhmm(hora) {
  return hora ? hora.slice(0, 5) : '';
}

async function carregarProfessores() {
  if (professoresCache) return professoresCache;
  professoresCache = await api.get('/api/aulas/professores');
  const sel = document.getElementById('aula-professor');
  sel.innerHTML = '<option value="">Sem professor definido</option>' +
    professoresCache.map((p) => `<option value="${p.id}">${p.nome}</option>`).join('');
  return professoresCache;
}

async function carregarAulas() {
  const body = document.getElementById('aulas-body');
  body.innerHTML = '<tr><td colspan="7" class="loading-row"><span class="spinner"></span></td></tr>';

  try {
    aulasCache = await api.get('/api/aulas/admin');
    body.innerHTML = aulasCache.length
      ? aulasCache.map((a) => `
          <tr>
            <td><strong>${a.nome}</strong></td>
            <td>${a.dia_semana_nome}</td>
            <td>${hhmm(a.hora_inicio)} – ${hhmm(a.hora_fim)}</td>
            <td>${a.professor_nome || '—'}</td>
            <td>${a.capacidade_maxima}</td>
            <td>
              <label class="switch" title="Ativar/desativar aula">
                <input type="checkbox" data-toggle-id="${a.id}" ${a.ativo ? 'checked' : ''} />
                <span class="slider"></span>
              </label>
            </td>
            <td>
              <button class="btn btn-ghost btn-sm" data-edit-id="${a.id}" title="Editar">
                ${Icons.icon('edit-2', { size: 14 })}
              </button>
            </td>
          </tr>
        `).join('')
      : '<tr><td colspan="7" class="empty-state">Nenhuma aula cadastrada ainda.</td></tr>';
  } catch (err) {
    body.innerHTML = '<tr><td colspan="7" class="empty-state">Não foi possível carregar as aulas.</td></tr>';
  }
}

document.getElementById('aulas-body').addEventListener('change', async (ev) => {
  const input = ev.target.closest('[data-toggle-id]');
  if (!input) return;
  const id = input.dataset.toggleId;
  input.disabled = true;
  try {
    await api.patch(`/api/aulas/${id}/toggle`, {});
    toast('Aula atualizada.', 'success');
    const aula = aulasCache.find((a) => String(a.id) === id);
    if (aula) aula.ativo = !aula.ativo;
  } catch (err) {
    input.checked = !input.checked;
    toast(err.message || 'Erro ao atualizar aula.', 'error');
  } finally {
    input.disabled = false;
  }
});

const dialogAula = document.getElementById('dialog-aula');
const formAula = document.getElementById('form-aula');

document.getElementById('aulas-body').addEventListener('click', async (ev) => {
  const btnEdit = ev.target.closest('[data-edit-id]');
  if (!btnEdit) return;
  const aula = aulasCache.find((a) => String(a.id) === btnEdit.dataset.editId);
  if (!aula) return;

  await carregarProfessores();
  document.getElementById('aula-dialog-titulo').textContent = `Editar — ${aula.nome}`;
  document.getElementById('aula-id').value = aula.id;
  document.getElementById('aula-nome').value = aula.nome;
  document.getElementById('aula-dia').value = aula.dia_semana;
  document.getElementById('aula-capacidade').value = aula.capacidade_maxima;
  document.getElementById('aula-hora-inicio').value = hhmm(aula.hora_inicio);
  document.getElementById('aula-hora-fim').value = hhmm(aula.hora_fim);
  document.getElementById('aula-professor').value = aula.professor_id || '';
  dialogAula.showModal();
});

document.getElementById('btn-nova-aula').addEventListener('click', async () => {
  await carregarProfessores();
  formAula.reset();
  document.getElementById('aula-dialog-titulo').textContent = 'Nova aula';
  document.getElementById('aula-id').value = '';
  dialogAula.showModal();
});
document.getElementById('btn-aula-cancel').addEventListener('click', () => dialogAula.close());

formAula.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const btnConfirm = document.getElementById('btn-aula-confirm');
  setBtnLoading(btnConfirm, 'Salvando...');

  const id = document.getElementById('aula-id').value;
  const payload = {
    nome: document.getElementById('aula-nome').value.trim(),
    dia_semana: Number(document.getElementById('aula-dia').value),
    hora_inicio: document.getElementById('aula-hora-inicio').value,
    hora_fim: document.getElementById('aula-hora-fim').value,
    capacidade_maxima: Number(document.getElementById('aula-capacidade').value),
    professor_id: document.getElementById('aula-professor').value || null,
  };

  try {
    if (id) {
      await api.put(`/api/aulas/${id}`, payload);
      toast('Aula atualizada com sucesso!', 'success');
    } else {
      await api.post('/api/aulas', payload);
      toast('Aula criada com sucesso!', 'success');
    }
    dialogAula.close();
    carregarAulas();
  } catch (err) {
    toast(err.message || 'Erro ao salvar aula.', 'error');
  } finally {
    resetBtnLoading(btnConfirm);
  }
});

carregarAulas();
