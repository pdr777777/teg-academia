const params = new URLSearchParams(window.location.search);
const state = {
  planos: [],
  planoSelecionado: null,
  token: null,
};

const PLANOS_FALLBACK = [
  { id: 1, nome: 'Mensal',     descricao: 'Acesso completo a todas as modalidades. Cancele quando quiser.',      preco_mensal: 119.90, duracao_dias: 30  },
  { id: 2, nome: 'Trimestral', descricao: 'Economia de R$30 em relação ao mensal. Renovação a cada 3 meses.',    preco_mensal: 109.90, duracao_dias: 90  },
  { id: 3, nome: 'Anual',      descricao: 'Melhor custo-benefício. Até R$240 de economia em 12 meses no Pix.',   preco_mensal:  99.90, duracao_dias: 365 },
];

function irParaStep(n) {
  document.querySelectorAll('.step-section').forEach((s) => (s.style.display = 'none'));
  document.getElementById(
    n === 1 ? 'step-plano' : n === 2 ? 'step-dados' : 'step-confirmacao'
  ).style.display = 'block';

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
  grid.innerHTML = state.planos.map((p) => `
    <div class="card plano-card" data-plano-id="${p.id}">
      <div class="plano-nome">${p.nome}</div>
      <div class="plano-desc">${p.descricao || ''}</div>
      <div class="plano-preco">${formatMoeda(p.preco_mensal)}<span>/mês</span></div>
      <div class="plano-duracao">Vigência de ${p.duracao_dias} dias</div>
    </div>
  `).join('');

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
  btn.disabled = true;
  btn.textContent = 'Aguarde...';

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
  } catch (err) {
    toast(err.message || 'Erro ao criar sua conta.', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Continuar<span data-icon="arrow-right"></span>';
    fillIcons();
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
  btn.disabled = true;
  btn.textContent = 'Confirmando...';

  try {
    await api.post('/api/matriculas', { plano_id: state.planoSelecionado.id });
    document.getElementById('confirmacao-form').style.display = 'none';
    document.getElementById('confirmacao-sucesso').style.display = 'block';
    fillIcons();
  } catch (err) {
    toast(err.message || 'Erro ao confirmar matrícula.', 'error');
    btn.disabled = false;
    btn.textContent = 'Confirmar matrícula';
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
