const params = new URLSearchParams(window.location.search);
const state = {
  planos: [],
  planoSelecionado: null,
  token: null,
};

const PLANOS_FALLBACK = [
  { id: 1, nome: 'Mensal',     preco_mensal: 119.90, duracao_dias: 30  },
  { id: 2, nome: 'Trimestral', preco_mensal: 109.90, duracao_dias: 90  },
  { id: 3, nome: 'Anual',      preco_mensal:  99.90, duracao_dias: 365 },
];

function brl(valor) {
  return 'R$' + valor.toFixed(2).replace('.', ',');
}

function getPlanMeta(plano) {
  const d = plano.duracao_dias;
  if (d <= 30) return {
    badge: null,
    nota: 'Ou R$129,90 no cartão de crédito',
    features: [
      'Acesso a todas as modalidades',
      'Acompanhamento de professores',
      'Área do aluno com sistema XP',
      'Grade de aulas em tempo real',
      'Sem fidelidade mínima',
    ],
    destaque: false,
  };
  if (d <= 90) return {
    badge: 'Mais popular',
    nota: `3x ${brl(plano.preco_mensal)} no crédito`,
    features: [
      'Acesso a todas as modalidades',
      'Acompanhamento de professores',
      'Área do aluno com sistema XP',
      'Grade de aulas em tempo real',
      'Economia de R$30 vs mensal',
    ],
    destaque: true,
  };
  return {
    badge: '🔥 Economize R$240/ano',
    nota: `12x ${brl(plano.preco_mensal)} recorrente no Pix`,
    features: [
      'Acesso a todas as modalidades',
      'Acompanhamento de professores',
      'Área do aluno com sistema XP',
      'Grade de aulas em tempo real',
      'Prioridade em agendamentos',
    ],
    destaque: false,
  };
}

function irParaStep(n) {
  document.querySelectorAll('.step-section').forEach((s) => (s.style.display = 'none'));
  const secao = document.getElementById(
    n === 1 ? 'step-plano' : n === 2 ? 'step-dados' : 'step-confirmacao'
  );
  secao.style.display = 'block';
  secao.classList.remove('step-enter');
  void secao.offsetWidth;
  secao.classList.add('step-enter');

  document.querySelectorAll('.step-item').forEach((el) => {
    const step = Number(el.dataset.step);
    el.classList.toggle('active', step === n);
    el.classList.toggle('done', step < n);
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

document.querySelectorAll('.step-back').forEach((btn) => {
  btn.addEventListener('click', () => irParaStep(Number(btn.dataset.back)));
});

function renderPlanos(grid) {
  grid.innerHTML = state.planos.map((p) => {
    const meta = getPlanMeta(p);
    return `
      <div class="plano-card${meta.destaque ? ' plano-destaque' : ''}" data-plano-id="${p.id}" data-reveal>
        ${meta.badge ? `<div class="plano-badge${meta.destaque ? '' : ' plano-badge-fire'}">${meta.badge}</div>` : ''}
        <div class="plano-nome">${p.nome}</div>
        <div class="plano-preco">
          <span class="plano-currency">R$</span><span class="plano-amount">${Math.floor(p.preco_mensal)}</span><span class="plano-cents">,${String(p.preco_mensal.toFixed(2)).split('.')[1]}</span><span class="plano-period">/mês</span>
        </div>
        <p class="plano-nota">${meta.nota}</p>
        <ul class="plano-features">
          ${meta.features.map((f) => `<li><span data-icon="check" data-icon-size="14"></span>${f}</li>`).join('')}
        </ul>
        <button class="btn ${meta.destaque ? 'btn-primary' : 'btn-outline'} btn-block plano-cta">Começar agora</button>
      </div>
    `;
  }).join('');
  initReveal();
  fillIcons();

  grid.querySelectorAll('.plano-card').forEach((card) => {
    card.addEventListener('click', () => selecionarPlano(Number(card.dataset.planoId)));
  });

  const preSelecionado = Number(params.get('plano'));
  if (preSelecionado && state.planos.some((p) => p.id === preSelecionado)) {
    selecionarPlano(preSelecionado);
  }
}

async function carregarPlanos() {
  const grid = document.getElementById('planos-grid');
  try {
    state.planos = await api.get('/api/planos');
    if (!state.planos.length) {
      state.planos = PLANOS_FALLBACK;
    }
    renderPlanos(grid);
  } catch (err) {
    state.planos = PLANOS_FALLBACK;
    renderPlanos(grid);
  }
}

function selecionarPlano(id) {
  state.planoSelecionado = state.planos.find((p) => p.id === id);
  document.querySelectorAll('.plano-card').forEach((card) => {
    card.classList.toggle('selecionado', Number(card.dataset.planoId) === id);
  });
  setTimeout(() => irParaStep(2), 150);
}

document.getElementById('form-dados').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const btn = ev.target.querySelector('button[type="submit"]');
  setBtnLoading(btn, 'Aguarde...');

  try {
    const { token } = await api.post('/api/auth/registro', {
      nome: document.getElementById('nome').value,
      email: document.getElementById('email').value,
      senha: document.getElementById('senha').value,
      telefone: document.getElementById('telefone').value,
      cpf: document.getElementById('cpf').value,
      data_nascimento: document.getElementById('data_nascimento').value,
      link_indicacao_origem: params.get('ref') || undefined,
    });
    state.token = token;
    localStorage.setItem('token', token);
    renderResumo();
    irParaStep(3);
    resetBtnLoading(btn);
  } catch (err) {
    toast(err.message || 'Erro ao criar sua conta.', 'error');
    resetBtnLoading(btn);
  }
});

function renderResumo() {
  const p = state.planoSelecionado;
  document.getElementById('resumo-plano').innerHTML = `
    <div class="resumo-linha"><span>Plano</span><strong>${p.nome}</strong></div>
    <div class="resumo-linha"><span>Vigência</span><span>${p.duracao_dias} dias</span></div>
    <div class="resumo-linha resumo-total"><span>Total</span><span>${formatMoeda(p.preco_mensal)}</span></div>
  `;
}

document.getElementById('btn-confirmar').addEventListener('click', async () => {
  const btn = document.getElementById('btn-confirmar');
  setBtnLoading(btn, 'Confirmando...');

  try {
    await api.post('/api/matriculas', { plano_id: state.planoSelecionado.id });
    document.getElementById('confirmacao-form').style.display = 'none';
    document.getElementById('confirmacao-sucesso').style.display = 'block';
    fillIcons();
  } catch (err) {
    toast(err.message || 'Erro ao confirmar matrícula.', 'error');
    resetBtnLoading(btn);
  }
});

async function carregarBannerIndicacao() {
  const ref = params.get('ref');
  if (!ref) return;
  try {
    const { indicador } = await api.get(`/api/indicacoes/ref/${ref}`);
    const banner = document.getElementById('banner-indicacao');
    banner.innerHTML = `
      <span class="avatar-fallback">${iniciais(indicador.nome)}</span>
      <div><strong>${indicador.nome} te convidou para a Academia TEG</strong><span>Matricule-se pelo link e garanta seu desconto de indicação.</span></div>
    `;
    banner.style.display = 'flex';
  } catch (err) {
    // link inválido ou indicador inativo — segue o fluxo normal sem banner
  }
}

carregarBannerIndicacao();
carregarPlanos();
