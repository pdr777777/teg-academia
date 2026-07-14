document.getElementById('btn-logout').addEventListener('click', logout);

const XP_LEVELS = [0, 500, 1200, 2500, 5000, 9000, 15000];
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const DIAS_ABREV = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function calcXpLevel(xp) {
  let level = 1;
  for (let i = 0; i < XP_LEVELS.length; i++) {
    if (xp >= XP_LEVELS[i]) level = i + 1;
    else break;
  }
  const cur = XP_LEVELS[level - 1] || 0;
  const next = XP_LEVELS[level] || cur * 2;
  const pct = Math.min(((xp - cur) / (next - cur)) * 100, 100);
  return { level, pct, remaining: next - xp };
}

function saudacaoHora() {
  const h = new Date().getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

async function carregarDashboard() {
  try {
    const d = await api.get('/api/alunos/dashboard');

    document.getElementById('saudacao').textContent = `${saudacaoHora()},`;
    document.getElementById('dash-nome').textContent = d.nome;
    document.getElementById('dash-sequencia').textContent = d.sequencia_atual;

    const lvl = calcXpLevel(d.xp);
    document.getElementById('dash-nivel').textContent = `Nv.${lvl.level}`;
    document.getElementById('dash-xp-next').textContent = `${lvl.remaining.toLocaleString('pt-BR')} XP até o próximo nível`;

    const pctSequencia = Math.min((d.sequencia_atual / Math.max(d.maior_sequencia, d.sequencia_atual, 7)) * 100, 100);
    document.getElementById('ring-sequencia').style.setProperty('--pct', pctSequencia);
    document.getElementById('ring-xp').style.setProperty('--pct', lvl.pct);

    const planoBadge = document.getElementById('dash-plano-badge');
    planoBadge.textContent = d.plano_nome
      ? `Plano ${d.plano_nome} — ${d.matricula_status === 'ativa' ? 'ativo' : d.matricula_status}`
      : 'Sem plano ativo';

    renderBloqueioBanner('bloqueio-banner', d);

    animateNumber(document.getElementById('stat-total-treinos'), d.total_treinos);

    document.getElementById('profile-avatar').textContent = iniciais(d.nome);
    document.getElementById('profile-nome').textContent = d.nome;
    document.getElementById('profile-email').textContent = d.email;
    document.getElementById('profile-plano').textContent = d.plano_nome ? `Plano ${d.plano_nome}` : 'Sem plano';
    document.getElementById('profile-vencimento').textContent = d.data_vencimento ? `Vence ${formatData(d.data_vencimento)}` : '';

    const lista = document.getElementById('lista-conquistas');
    lista.innerHTML = d.conquistas_recentes.length
      ? d.conquistas_recentes.map((c) => `
          <div class="conquista-item">
            <span class="icon-badge">${Icons.icon('award', { size: 18 })}</span>
            <div><strong>${c.nome}</strong><span>${formatData(c.desbloqueada_em)}</span></div>
          </div>
        `).join('')
      : '<div class="empty-state">Nenhuma conquista ainda — treine para desbloquear!</div>';
  } catch (err) {
    toast(err.message || 'Erro ao carregar seus dados.', 'error');
  }
}

async function carregarTreinoDoDia() {
  const nomeEl = document.getElementById('dash-treino-nome');
  const metaEl = document.getElementById('dash-treino-meta');
  const bg = document.getElementById('dash-treino-bg');

  try {
    const treinos = await api.get('/api/treinos/meu');
    const treino = treinos[0];
    if (!treino) {
      nomeEl.textContent = 'Nenhum treino atribuído';
      metaEl.textContent = 'Fale com seu professor na recepção';
      return;
    }

    const exercicios = (treino.exercicios || []).filter((e) => e && e.exercicio);
    nomeEl.textContent = treino.nome;
    metaEl.textContent = `${exercicios.length} exercício${exercicios.length === 1 ? '' : 's'}${treino.descricao ? ' · ' + treino.descricao : ''}`;

    const comFoto = exercicios.find((e) => e.exercicio.imagem_url);
    if (comFoto) {
      bg.style.backgroundImage = `linear-gradient(135deg, rgba(20,14,10,.35), rgba(9,7,6,.75)), url('${comFoto.exercicio.imagem_url}')`;
    }
  } catch {
    nomeEl.textContent = 'Não foi possível carregar seu treino';
    metaEl.textContent = '';
  }
}

async function carregarCalendario() {
  const grid = document.getElementById('calendario-grid');
  const agora = new Date();
  const mes = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`;
  document.getElementById('calendar-mes').textContent = `${MESES[agora.getMonth()]} ${agora.getFullYear()}`;

  try {
    const frequencias = await api.get(`/api/frequencias/minha?mes=${mes}`);
    const diasTreinados = new Set(frequencias.map((f) => new Date(f.data).getUTCDate()));

    const totalDias = new Date(agora.getFullYear(), agora.getMonth() + 1, 0).getDate();
    const primeiroDiaSemana = new Date(agora.getFullYear(), agora.getMonth(), 1).getDay();

    const diaHoje = agora.getDate();
    let html = '';
    for (let i = 0; i < primeiroDiaSemana; i++) html += '<div class="cal-dia vazio"></div>';
    for (let dia = 1; dia <= totalDias; dia++) {
      const classes = ['cal-dia'];
      if (diasTreinados.has(dia)) classes.push('treinou');
      if (dia === diaHoje) classes.push('hoje');
      html += `<div class="${classes.join(' ')}">${dia}</div>`;
    }
    grid.innerHTML = html;

    document.getElementById('hoje-status').textContent = diasTreinados.has(diaHoje)
      ? 'Treino registrado hoje!'
      : 'Ainda não treinou hoje';
  } catch (err) {
    grid.innerHTML = '<div class="empty-state">Não foi possível carregar a frequência.</div>';
  }
}

function inicioDaSemana(data) {
  const d = new Date(data);
  const diaSemana = d.getDay();
  const offset = diaSemana === 0 ? -6 : 1 - diaSemana;
  d.setDate(d.getDate() + offset);
  d.setHours(0, 0, 0, 0);
  return d;
}

async function carregarFrequenciaSemana() {
  const hoje = new Date();
  const segunda = inicioDaSemana(hoje);
  const diasSemana = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(segunda);
    d.setDate(d.getDate() + i);
    return d;
  });

  const meses = [...new Set(diasSemana.map((d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`))];

  let treinados = new Set();
  try {
    const resultados = await Promise.all(meses.map((mes) => api.get(`/api/frequencias/minha?mes=${mes}`)));
    treinados = new Set(resultados.flat().map((f) => new Date(f.data).toISOString().slice(0, 10)));
  } catch (err) {
    // segue com o set vazio — as barras aparecem todas "não treinou"
  }

  const chaveHoje = hoje.toISOString().slice(0, 10);
  const LABELS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

  const bars = document.getElementById('bars-semana');
  bars.innerHTML = diasSemana.map((d, i) => {
    const chave = d.toISOString().slice(0, 10);
    const classes = ['bar'];
    if (treinados.has(chave)) classes.push('on');
    if (chave === chaveHoje) classes.push('hoje');
    return `<div class="bar-col"><div class="${classes.join(' ')}"></div><span>${LABELS[i]}</span></div>`;
  }).join('');

  const pontos = diasSemana.map((d, i) => {
    const chave = d.toISOString().slice(0, 10);
    const y = treinados.has(chave) ? 6 : 24;
    const x = (i / 6) * 100;
    return `${x},${y}`;
  }).join(' ');
  document.querySelector('#freq-sparkline polyline').setAttribute('points', pontos);
}

function minutosAteAula(aula, diaAtual, horaAtualMin) {
  const [h, m] = aula.hora_inicio.split(':').map(Number);
  const diffDias = (aula.dia_semana - diaAtual + 7) % 7;
  let minutos = diffDias * 1440 + (h * 60 + m);
  if (diffDias === 0 && h * 60 + m < horaAtualMin) minutos += 7 * 1440;
  return minutos;
}

async function carregarAgenda() {
  try {
    const grade = await api.get('/api/aulas');
    const todasAulas = grade.flatMap((dia) => dia.aulas);

    const agora = new Date();
    const diaAtual = agora.getDay();
    const horaAtualMin = agora.getHours() * 60 + agora.getMinutes();

    const ordenadas = [...todasAulas].sort(
      (a, b) => minutosAteAula(a, diaAtual, horaAtualMin) - minutosAteAula(b, diaAtual, horaAtualMin)
    );

    const proxima = ordenadas[0];
    if (proxima) {
      const ehHoje = minutosAteAula(proxima, diaAtual, horaAtualMin) < 1440;
      document.getElementById('next-aula-nome').textContent =
        `${proxima.nome} — ${ehHoje ? 'hoje' : DIAS_ABREV[proxima.dia_semana]} ${proxima.hora_inicio.slice(0, 5)}`;
      document.getElementById('next-aula-prof').textContent = proxima.professor_nome ? `Prof. ${proxima.professor_nome}` : '';
    } else {
      document.getElementById('next-aula-nome').textContent = 'Nenhuma aula cadastrada';
    }

    const lista = document.getElementById('lista-agenda');
    lista.innerHTML = ordenadas.length
      ? ordenadas.slice(0, 5).map((a) => `
          <div class="agenda-item">
            <span class="agenda-dot"></span>${DIAS_ABREV[a.dia_semana]} ${a.hora_inicio.slice(0, 5)} — ${a.nome}
          </div>
        `).join('')
      : '<div class="empty-state">Nenhuma aula cadastrada.</div>';
  } catch (err) {
    document.getElementById('next-aula-nome').textContent = 'Não foi possível carregar a agenda.';
  }
}

document.getElementById('btn-checkin').addEventListener('click', async (ev) => {
  const btn = ev.currentTarget;
  btn.disabled = true;
  try {
    await api.post('/api/frequencias/checkin', {});
    toast('Treino registrado! +50 XP', 'success');
    btn.classList.add('success-burst');
    setTimeout(() => btn.classList.remove('success-burst'), 600);
    await Promise.all([carregarDashboard(), carregarCalendario(), carregarFrequenciaSemana()]);
  } catch (err) {
    toast(err.message || 'Erro ao registrar check-in.', 'error');
  } finally {
    btn.disabled = false;
  }
});

// ===== Sidebar mobile =====
const btnSidebarToggle = document.getElementById('btn-dash-sidebar-toggle');
const sidebarEl = document.getElementById('dash-sidebar');
const sidebarScrim = document.getElementById('sidebar-scrim');

function fecharSidebar() {
  sidebarEl.classList.remove('open');
  sidebarScrim.classList.remove('open');
  btnSidebarToggle.setAttribute('aria-expanded', 'false');
}
btnSidebarToggle.addEventListener('click', () => {
  const abrir = !sidebarEl.classList.contains('open');
  sidebarEl.classList.toggle('open', abrir);
  sidebarScrim.classList.toggle('open', abrir);
  btnSidebarToggle.setAttribute('aria-expanded', String(abrir));
});
sidebarScrim.addEventListener('click', fecharSidebar);

// ===== Painel de configurações =====
const configOverlay = document.getElementById('config-overlay');

function abrirConfig() {
  configOverlay.classList.add('open');
  carregarConfig();
}
function fecharConfig() {
  configOverlay.classList.remove('open');
}
document.getElementById('btn-open-config').addEventListener('click', abrirConfig);
document.getElementById('btn-close-config').addEventListener('click', fecharConfig);
configOverlay.addEventListener('click', (ev) => {
  if (ev.target === configOverlay) fecharConfig();
});

document.querySelectorAll('.drawer-nav-item').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.drawer-nav-item').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.drawer-section').forEach((s) => s.classList.remove('active'));
    btn.classList.add('active');
    document.querySelector(`.drawer-section[data-section-panel="${btn.dataset.section}"]`).classList.add('active');
  });
});

async function carregarConfig() {
  try {
    const u = await api.get('/api/alunos/perfil');
    document.getElementById('config-conta-nome').textContent = u.nome;
    document.getElementById('config-conta-email').textContent = u.email;
    document.getElementById('config-conta-telefone').textContent = u.telefone || 'Não informado';

    const toggle = document.getElementById('toggle-whatsapp');
    const ativo = u.notificacoes_whatsapp !== false;
    toggle.classList.toggle('on', ativo);
    toggle.setAttribute('aria-checked', String(ativo));
  } catch (err) {
    toast(err.message || 'Erro ao carregar configurações.', 'error');
  }
}

document.getElementById('toggle-whatsapp').addEventListener('click', async (ev) => {
  const toggle = ev.currentTarget;
  const novoValor = !toggle.classList.contains('on');
  toggle.classList.toggle('on', novoValor);
  toggle.setAttribute('aria-checked', String(novoValor));
  try {
    await api.patch('/api/alunos/perfil', { notificacoes_whatsapp: novoValor });
    toast('Salvo', 'success');
  } catch (err) {
    toggle.classList.toggle('on', !novoValor);
    toggle.setAttribute('aria-checked', String(!novoValor));
    toast(err.message || 'Erro ao salvar preferência.', 'error');
  }
});

document.getElementById('form-senha').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const btn = document.getElementById('btn-senha-salvar');
  setBtnLoading(btn, 'Salvando...');
  try {
    const res = await api.patch('/api/auth/senha', {
      senha_atual: document.getElementById('config-senha-atual').value,
      nova_senha: document.getElementById('config-senha-nova').value,
    });
    localStorage.setItem('token', res.token);
    document.getElementById('form-senha').reset();
    toast('Senha alterada!', 'success');
  } catch (err) {
    toast(err.message || 'Erro ao trocar senha.', 'error');
  } finally {
    resetBtnLoading(btn);
  }
});

carregarDashboard();
carregarCalendario();
carregarFrequenciaSemana();
carregarAgenda();
carregarTreinoDoDia();
