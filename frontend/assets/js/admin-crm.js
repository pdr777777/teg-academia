const ETAPAS = [
  { key: 'novo_lead', label: 'Novo Lead' },
  { key: 'contato', label: 'Contato' },
  { key: 'visitou', label: 'Visitou' },
  { key: 'matriculado', label: 'Matriculado' },
  { key: 'perdido', label: 'Perdido' },
];

let leads = [];

function cardHtml(lead) {
  return `
    <div class="kanban-card" draggable="true" data-lead-id="${lead.id}">
      <strong>${escapeHtml(lead.nome)}</strong>
      <div class="kanban-meta">${Icons.icon('phone', { size: 13 })}${escapeHtml(lead.telefone)}</div>
      ${lead.objetivo ? `<div class="kanban-meta">${Icons.icon('zap', { size: 13 })}${escapeHtml(lead.objetivo)}</div>` : ''}
      <div class="kanban-meta">${Icons.icon('calendar', { size: 13 })}${formatData(lead.created_at)} · ${escapeHtml(lead.origem || 'site')}</div>
    </div>
  `;
}

function renderBoard() {
  const board = document.getElementById('kanban-board');
  board.innerHTML = ETAPAS.map((etapa) => {
    const doEtapa = leads.filter((l) => l.status_pipeline === etapa.key);
    return `
      <div class="kanban-col">
        <div class="kanban-col-head"><span>${etapa.label}</span><span class="badge badge-muted">${doEtapa.length}</span></div>
        <div class="kanban-col-body" data-etapa="${etapa.key}">
          ${doEtapa.map(cardHtml).join('') || ''}
        </div>
      </div>
    `;
  }).join('');

  ativarDragDrop();
}

function ativarDragDrop() {
  document.querySelectorAll('.kanban-card').forEach((card) => {
    card.addEventListener('dragstart', (ev) => {
      ev.dataTransfer.setData('text/plain', card.dataset.leadId);
      setTimeout(() => card.classList.add('dragging'), 0);
    });
    card.addEventListener('dragend', () => card.classList.remove('dragging'));
  });

  document.querySelectorAll('.kanban-col-body').forEach((col) => {
    col.addEventListener('dragover', (ev) => {
      ev.preventDefault();
      col.classList.add('drag-over');
    });
    col.addEventListener('dragleave', () => col.classList.remove('drag-over'));
    col.addEventListener('drop', async (ev) => {
      ev.preventDefault();
      col.classList.remove('drag-over');
      const leadId = ev.dataTransfer.getData('text/plain');
      const novaEtapa = col.dataset.etapa;
      const lead = leads.find((l) => String(l.id) === leadId);
      if (!lead || lead.status_pipeline === novaEtapa) return;

      const etapaAnterior = lead.status_pipeline;
      lead.status_pipeline = novaEtapa;
      renderBoard();

      try {
        await api.patch(`/api/leads/${leadId}/pipeline`, { status_novo: novaEtapa });
      } catch (err) {
        lead.status_pipeline = etapaAnterior;
        renderBoard();
        toast(err.message || 'Erro ao mover lead.', 'error');
      }
    });
  });
}

async function carregarLeads() {
  try {
    leads = await api.get('/api/leads?limit=100');
    renderBoard();
  } catch (err) {
    document.getElementById('kanban-board').innerHTML = '<div class="empty-state" style="grid-column:1/-1">Não foi possível carregar os leads.</div>';
  }
}

carregarLeads();
