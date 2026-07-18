const params = new URLSearchParams(window.location.search);
const state = { planos: [] };

const WHATSAPP_NUMERO = '5567993009296';

const PLANOS_FALLBACK = [
  { id: 1, nome: 'Mensal', preco_mensal: 119.90, duracao_dias: 30, descricao: 'Cartão de débito ou crédito (R$129,90), ou Pix/dinheiro com desconto de 7,6%' },
  { id: 2, nome: 'Trimestral', preco_mensal: 109.90, duracao_dias: 90, descricao: '3x de R$109,90 no crédito' },
  { id: 3, nome: 'Anual', preco_mensal: 99.90, duracao_dias: 365, descricao: '12x R$109,90 recorrente no cartão, 12x R$99,90 parcelado (necessário limite de R$1.198,80), ou 12x R$109,90 recorrente no Pix' },
];

function brl(valor) {
  return 'R$' + Number(valor).toFixed(2).replace('.', ',');
}

function getPlanMeta(plano) {
  const d = plano.duracao_dias;
  if (d <= 30) return {
    badge: null,
    nota: plano.descricao || 'Ou R$129,90 no cartão de crédito',
    features: [
      'Acesso completo à musculação',
      'Acompanhamento de professores',
      'Área do aluno com sistema XP',
      'Grade de aulas em tempo real',
      'Sem fidelidade mínima',
    ],
    destaque: false,
  };
  if (d <= 90) return {
    badge: 'Mais popular',
    nota: plano.descricao || `3x ${brl(plano.preco_mensal)} no crédito`,
    features: [
      'Acesso completo à musculação',
      'Acompanhamento de professores',
      'Área do aluno com sistema XP',
      'Grade de aulas em tempo real',
      'Economia de R$30 vs mensal',
    ],
    destaque: true,
  };
  return {
    badge: '🔥 Economize R$240/ano',
    nota: plano.descricao || `12x ${brl(plano.preco_mensal)} recorrente no cartão`,
    features: [
      'Acesso completo à musculação',
      'Acompanhamento de professores',
      'Área do aluno com sistema XP',
      'Grade de aulas em tempo real',
      'Prioridade em agendamentos',
    ],
    destaque: false,
  };
}

function linkWhatsapp(plano) {
  const ref = params.get('ref');
  const msg =
    `Olá! Tenho interesse no plano ${plano.nome} da Academia TEG ` +
    `(${brl(plano.preco_mensal)}/mês). Pode me ajudar a finalizar minha matrícula?` +
    (ref ? ` (indicação: ${ref})` : '');
  return `https://wa.me/${WHATSAPP_NUMERO}?text=${encodeURIComponent(msg)}`;
}

function renderPlanos(grid) {
  grid.innerHTML = state.planos.map((p) => {
    const meta = getPlanMeta(p);
    return `
      <div class="plano-card${meta.destaque ? ' plano-destaque' : ''}" data-reveal>
        ${meta.badge ? `<div class="plano-badge${meta.destaque ? '' : ' plano-badge-fire'}">${meta.badge}</div>` : ''}
        <div class="plano-nome">${p.nome}</div>
        <div class="plano-preco">
          <span class="plano-currency">R$</span><span class="plano-amount">${Math.floor(p.preco_mensal)}</span><span class="plano-cents">,${String(Number(p.preco_mensal).toFixed(2)).split('.')[1]}</span><span class="plano-period">/mês</span>
        </div>
        <p class="plano-nota">${meta.nota}</p>
        <ul class="plano-features">
          ${meta.features.map((f) => `<li><span data-icon="check" data-icon-size="14"></span>${f}</li>`).join('')}
        </ul>
        <a href="${linkWhatsapp(p)}" target="_blank" rel="noopener" class="btn ${meta.destaque ? 'btn-primary' : 'btn-outline'} btn-block plano-cta">
          <span data-icon="whatsapp" data-icon-size="16"></span>Escolher este plano
        </a>
      </div>
    `;
  }).join('');
  initReveal();
  fillIcons();
}

async function carregarPlanos() {
  const grid = document.getElementById('planos-grid');
  try {
    state.planos = await api.get('/api/planos');
    if (!state.planos.length) state.planos = PLANOS_FALLBACK;
  } catch (err) {
    state.planos = PLANOS_FALLBACK;
  }
  renderPlanos(grid);
}

async function carregarBannerIndicacao() {
  const ref = params.get('ref');
  if (!ref) return;
  try {
    const { indicador } = await api.get(`/api/indicacoes/ref/${ref}`);
    const banner = document.getElementById('banner-indicacao');
    banner.innerHTML = `
      <span class="avatar-fallback">${iniciais(indicador.nome)}</span>
      <div><strong>${indicador.nome} te convidou para a Academia TEG</strong><span>Escolha um plano e garanta seu desconto de indicação.</span></div>
    `;
    banner.style.display = 'flex';
  } catch (err) {
    // link inválido ou indicador inativo — segue o fluxo normal sem banner
  }
}

carregarBannerIndicacao();
carregarPlanos();
