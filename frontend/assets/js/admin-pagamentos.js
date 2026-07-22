const STATUS_PAGAMENTO = {
  pendente: { label: 'Pendente', classe: 'badge-warning' },
  pago: { label: 'Pago', classe: 'badge-success' },
  cancelado: { label: 'Cancelado', classe: 'badge-danger' },
};

let pagamentoSelecionadoId = null;

async function carregarPagamentos(status = '') {
  const body = document.getElementById('pagamentos-body');
  body.innerHTML = '<tr><td colspan="6" class="loading-row"><span class="spinner"></span></td></tr>';

  try {
    const query = status ? `?status=${status}` : '';
    const pagamentos = await api.get(`/api/pagamentos${query}`);

    body.innerHTML = pagamentos.length
      ? pagamentos.map((p) => {
          const s = STATUS_PAGAMENTO[p.status] || STATUS_PAGAMENTO.pendente;
          return `
            <tr>
              <td><strong>${escapeHtml(p.nome)}</strong><div class="text-muted" style="font-size:.78rem">${escapeHtml(p.email)}</div></td>
              <td>${escapeHtml(p.plano_nome)}</td>
              <td>${formatMoeda(p.valor)}</td>
              <td><span class="badge ${s.classe}">${s.label}</span></td>
              <td>${p.data_pagamento ? formatData(p.data_pagamento) : formatData(p.created_at)}</td>
              <td>${p.status === 'pendente' ? `<button class="btn btn-outline btn-sm" data-confirmar="${p.id}">Confirmar</button>` : ''}</td>
            </tr>
          `;
        }).join('')
      : '<tr><td colspan="6" class="empty-state">Nenhum pagamento encontrado.</td></tr>';
  } catch (err) {
    body.innerHTML = '<tr><td colspan="6" class="empty-state">Não foi possível carregar os pagamentos.</td></tr>';
  }
}

const modal = document.getElementById('modal-confirmar');

document.getElementById('pagamentos-body').addEventListener('click', (ev) => {
  const btn = ev.target.closest('[data-confirmar]');
  if (!btn) return;
  pagamentoSelecionadoId = btn.dataset.confirmar;
  modal.style.display = 'flex';
});

document.getElementById('btn-cancelar-modal').addEventListener('click', () => {
  modal.style.display = 'none';
  pagamentoSelecionadoId = null;
});

document.getElementById('btn-confirmar-modal').addEventListener('click', async () => {
  const metodo = document.getElementById('select-metodo').value;
  const btn = document.getElementById('btn-confirmar-modal');
  setBtnLoading(btn, 'Confirmando...');
  try {
    await api.patch(`/api/pagamentos/${pagamentoSelecionadoId}/confirmar`, { metodo });
    modal.style.display = 'none';
    toast('Pagamento confirmado.', 'success');
    carregarPagamentos(document.getElementById('filtro-status').value);
  } catch (err) {
    toast(err.message || 'Erro ao confirmar pagamento.', 'error');
  } finally {
    resetBtnLoading(btn);
  }
});

document.getElementById('filtro-status').addEventListener('change', (ev) => {
  carregarPagamentos(ev.target.value);
});

carregarPagamentos();
