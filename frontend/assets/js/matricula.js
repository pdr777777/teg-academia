const params = new URLSearchParams(window.location.search);
const state = { planos: [], planoSelecionado: null };

const WHATSAPP_NUMERO = '5567993009296';
const STEPS = ['plano', 'dados', 'sucesso'];

const PLANOS_FALLBACK = [
  { id: 1, nome: 'Mensal', preco_mensal: 119.90, duracao_dias: 30, descricao: 'Cartão de débito ou crédito (R$129,90), ou Pix/dinheiro com desconto de 7,6%' },
  { id: 2, nome: 'Trimestral', preco_mensal: 109.90, duracao_dias: 90, descricao: '3x de R$109,90 no crédito' },
  { id: 3, nome: 'Anual', preco_mensal: 99.90, duracao_dias: 365, descricao: '12x R$109,90 recorrente no cartão, 12x R$99,90 parcelado (necessário limite de R$1.198,80), ou 12x R$109,90 recorrente no Pix' },
];

function brl(valor) {
  return 'R$' + Number(valor).toFixed(2).replace('.', ',');
}

function slugPlano(plano) {
  const d = plano.duracao_dias;
  if (d <= 30) return 'mensal';
  if (d <= 90) return 'trimestral';
  return 'anual';
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

function setStep(step) {
  STEPS.forEach((s) => { document.getElementById(`step-${s}`).style.display = s === step ? '' : 'none'; });
  document.querySelectorAll('.step-item').forEach((el) => {
    el.classList.remove('active', 'done');
    if (STEPS.indexOf(el.dataset.step) < STEPS.indexOf(step)) el.classList.add('done');
    if (el.dataset.step === step) el.classList.add('active');
  });
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function selecionarPlano(plano) {
  state.planoSelecionado = plano;
  document.getElementById('plano-resumo-nome').textContent = plano.nome;
  document.getElementById('plano-resumo-preco').textContent = `${brl(plano.preco_mensal)}/mês`;
  setStep('dados');
}

function renderPlanos(grid) {
  grid.innerHTML = state.planos.map((p, i) => {
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
        <button type="button" class="btn ${meta.destaque ? 'btn-primary' : 'btn-outline'} btn-block plano-cta" data-plano-index="${i}">
          Escolher este plano
        </button>
      </div>
    `;
  }).join('');
  grid.querySelectorAll('.plano-cta').forEach((btn) => {
    btn.addEventListener('click', () => selecionarPlano(state.planos[Number(btn.dataset.planoIndex)]));
  });
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

  const planoQuery = params.get('plano');
  if (planoQuery) {
    const alvo = state.planos.find((p) => slugPlano(p) === planoQuery);
    if (alvo) selecionarPlano(alvo);
  }
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

function mostrarSucesso(user, plano) {
  document.getElementById('sucesso-plano-nome').textContent = plano.nome;
  document.getElementById('resumo-plano').textContent = plano.nome;
  document.getElementById('resumo-valor').textContent = `${brl(plano.preco_mensal)}/mês`;

  const msg = encodeURIComponent(
    `Olá! Acabei de me matricular no plano ${plano.nome} da Academia TEG (${brl(plano.preco_mensal)}/mês) pelo site, em nome de ${user.nome}. Quero finalizar o pagamento.`
  );
  document.getElementById('btn-sucesso-whatsapp').href = `https://wa.me/${WHATSAPP_NUMERO}?text=${msg}`;

  const recepcaoInfo = document.getElementById('recepcao-info');
  recepcaoInfo.style.display = 'none';
  document.getElementById('btn-sucesso-recepcao').textContent = 'Prefiro finalizar na recepção';

  setStep('sucesso');
}

document.getElementById('btn-voltar-plano').addEventListener('click', () => setStep('plano'));

document.getElementById('btn-sucesso-recepcao').addEventListener('click', (ev) => {
  const info = document.getElementById('recepcao-info');
  const mostrar = info.style.display === 'none';
  info.style.display = mostrar ? 'block' : 'none';
  ev.currentTarget.textContent = mostrar ? 'Ocultar informações' : 'Prefiro finalizar na recepção';
});

document.getElementById('form-matricula').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const form = ev.target;
  const btn = form.querySelector('button[type="submit"]');

  if (!state.planoSelecionado) {
    toast('Selecione um plano antes de continuar.', 'error');
    setStep('plano');
    return;
  }

  const senha = form.senha.value;
  const confirmarSenha = form.confirmar_senha.value;

  if (senha.length < 8 || !/[a-zA-Z]/.test(senha) || !/[0-9]/.test(senha)) {
    toast('A senha precisa ter no mínimo 8 caracteres, com letra e número.', 'error');
    return;
  }
  if (senha !== confirmarSenha) {
    toast('As senhas não coincidem.', 'error');
    return;
  }

  setBtnLoading(btn, 'Confirmando...');

  try {
    const { token, user } = await api.post('/api/auth/registro', {
      nome: form.nome.value.trim(),
      email: form.email.value.trim(),
      senha,
      telefone: form.telefone.value.trim(),
      link_indicacao_origem: params.get('ref') || undefined,
    });
    localStorage.setItem('token', token);

    await api.post('/api/matriculas', { plano_id: state.planoSelecionado.id });

    mostrarSucesso(user, state.planoSelecionado);
  } catch (err) {
    if (err.status === 409) {
      toast('Esse e-mail já tem uma conta na TEG. Faça login pra continuar sua matrícula.', 'error');
    } else {
      toast(err.message || 'Erro ao confirmar matrícula. Tente novamente.', 'error');
    }
    resetBtnLoading(btn);
  }
});

carregarBannerIndicacao();
carregarPlanos();
