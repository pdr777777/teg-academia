document.getElementById('btn-logout').addEventListener('click', logout);

const state = {
  treinos: [], // todos os treinos ativos do aluno (grade semanal — pode ser só 1)
  treino: null, // treino selecionado na aba atual
  sessao: null, // { id, iniciado_em, series_registradas: [{ treino_exercicio_id, numero_serie, ... }] }
};

let timerInterval = null;

// Mostra só a miniatura + botão de play — monta o iframe de verdade apenas
// quando o aluno toca (ver listener em #lista-exercicios mais abaixo). Com
// vários exercícios por treino, carregar um iframe do YouTube pra cada um
// de cara deixa a tela pesada; assim só carrega o que o aluno realmente for
// assistir.
function embedVideo(url) {
  if (!url) return `<div class="play-placeholder">${Icons.icon('play', { size: 28 })}<span>Vídeo em breve</span></div>`;
  const youtubeMatch = url.match(/(?:youtu\.be\/|[?&]v=|shorts\/)([\w-]{11})/);
  if (youtubeMatch) {
    const id = youtubeMatch[1];
    return `<button type="button" class="video-thumb" data-youtube-id="${id}" aria-label="Assistir vídeo do exercício" style="background-image:url('https://img.youtube.com/vi/${id}/hqdefault.jpg')">
      <span class="video-thumb-play">${Icons.icon('play', { size: 28 })}</span>
    </button>`;
  }
  return `<video src="${escapeHtml(url)}" controls></video>`;
}

function seriesFeitasDoExercicio(treinoExercicioId) {
  if (!state.sessao) return [];
  return state.sessao.series_registradas.filter((s) => s.treino_exercicio_id === treinoExercicioId);
}

function formatTempo(totalSegundos) {
  const m = Math.floor(totalSegundos / 60).toString().padStart(2, '0');
  const s = Math.floor(totalSegundos % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function iniciarTimer() {
  clearInterval(timerInterval);
  if (!state.sessao) return;
  const inicio = new Date(state.sessao.iniciado_em).getTime();
  const tick = () => {
    document.getElementById('sessao-timer').textContent = formatTempo((Date.now() - inicio) / 1000);
  };
  tick();
  timerInterval = setInterval(tick, 1000);
}

function renderSessaoBar() {
  const bar = document.getElementById('sessao-bar');
  const btnIniciar = document.getElementById('btn-iniciar-treino');
  if (state.sessao) {
    bar.style.display = 'flex';
    btnIniciar.style.display = 'none';
    iniciarTimer();
  } else {
    bar.style.display = 'none';
    btnIniciar.style.display = state.treino ? 'inline-flex' : 'none';
    clearInterval(timerInterval);
  }
}

function renderSerieTracker(te) {
  if (!state.sessao) return '';
  const feitas = seriesFeitasDoExercicio(te.id);
  const totalSeries = Number(te.series) || 1;
  const proximaSerie = feitas.length + 1;
  const completo = feitas.length >= totalSeries;

  const pills = Array.from({ length: totalSeries }, (_, i) => {
    const num = i + 1;
    const feita = feitas.find((f) => f.numero_serie === num);
    if (feita) return `<span class="serie-pill feita" title="${feita.repeticoes_realizadas || '-'} reps${feita.carga_realizada ? ' · ' + feita.carga_realizada + 'kg' : ''}">${Icons.icon('check', { size: 12 })}</span>`;
    if (num === proximaSerie) return `<button type="button" class="serie-pill proxima" data-abrir-serie="${te.id}">${num}</button>`;
    return `<span class="serie-pill pendente">${num}</span>`;
  }).join('');

  return `
    <div class="serie-tracker">
      <div class="serie-tracker-head">
        <span>Séries realizadas</span>
        <span class="serie-tracker-count">${feitas.length}/${totalSeries}</span>
      </div>
      <div class="serie-pills">${pills}</div>
      ${!completo ? `
        <div class="serie-form" id="serie-form-${te.id}" style="display:none">
          <input type="number" class="input" placeholder="Reps (${te.repeticoes})" id="serie-reps-${te.id}" />
          <input type="number" class="input" placeholder="Carga (kg)" step="0.5" value="${parseFloat(te.carga) || ''}" id="serie-carga-${te.id}" />
          <button type="button" class="btn btn-primary btn-sm" data-confirmar-serie="${te.id}" data-numero="${proximaSerie}">Concluir</button>
        </div>
        <div class="serie-descanso" id="serie-descanso-${te.id}" style="display:none">
          <div class="serie-descanso-head">
            <span>${Icons.icon('clock', { size: 15 })}Descansando</span>
            <strong class="serie-descanso-time"></strong>
          </div>
          <div class="serie-descanso-bar"><div class="serie-descanso-fill"></div></div>
        </div>
      ` : `<div class="serie-tracker-completo">${Icons.icon('check-circle', { size: 14 })}Exercício completo!</div>`}
    </div>
  `;
}

function renderExercicios() {
  const lista = document.getElementById('lista-exercicios');
  const exercicios = (state.treino?.exercicios || []).filter((e) => e && e.exercicio);
  if (!exercicios.length) {
    lista.innerHTML = '<div class="empty-state">Nenhum exercício cadastrado neste treino.</div>';
    return;
  }

  lista.innerHTML = exercicios.map((te) => `
    <div class="card exercicio-card" data-reveal>
      <div class="exercicio-video">${embedVideo(te.exercicio.video_url)}</div>
      <div class="exercicio-body">
        <div class="exercicio-head">
          <h3>${escapeHtml(te.exercicio.nome)}</h3>
          ${te.exercicio.grupo_muscular ? `<span class="badge badge-muted">${escapeHtml(te.exercicio.grupo_muscular)}</span>` : ''}
        </div>
        <div class="exercicio-stats">
          <div class="exercicio-stat"><strong>${te.series}</strong><span>Séries</span></div>
          <div class="exercicio-stat"><strong>${te.repeticoes}</strong><span>Repetições</span></div>
          <div class="exercicio-stat"><strong>${te.carga ? te.carga + ' kg' : '-'}</strong><span>Carga</span></div>
          <div class="exercicio-stat"><strong>${te.descanso_segundos ? te.descanso_segundos + 's' : '-'}</strong><span>Descanso</span></div>
        </div>
        ${te.observacoes ? `<div class="exercicio-obs">${escapeHtml(te.observacoes)}</div>` : ''}
        ${renderSerieTracker(te)}
      </div>
    </div>
  `).join('');
  initReveal();
  fillIcons();
}

function renderTabs() {
  const tabs = document.getElementById('treino-tabs');
  if (state.treinos.length < 2) {
    tabs.style.display = 'none';
    tabs.innerHTML = '';
    return;
  }
  tabs.style.display = 'flex';
  tabs.innerHTML = state.treinos.map((t) => `
    <button type="button" class="treino-tab${t.id === state.treino?.id ? ' active' : ''}" data-treino-id="${t.id}">${escapeHtml(t.nome)}</button>
  `).join('');
}

function selecionarTreino(treino) {
  state.treino = treino;
  document.getElementById('treino-nome').textContent = treino.nome;
  document.getElementById('treino-desc').textContent = treino.descricao || '';
  renderTabs();
  renderSessaoBar();
  renderExercicios();
}

document.getElementById('treino-tabs').addEventListener('click', (ev) => {
  const btn = ev.target.closest('[data-treino-id]');
  if (!btn) return;
  const treino = state.treinos.find((t) => t.id === Number(btn.dataset.treinoId));
  if (treino && treino.id !== state.treino?.id) selecionarTreino(treino);
});

async function carregarTreino() {
  try {
    state.treinos = await api.get('/api/treinos/meu');

    if (!state.treinos.length) {
      state.treino = null;
      document.getElementById('treino-desc').textContent = 'Nenhum treino atribuído ainda.';
      document.getElementById('lista-exercicios').innerHTML = '<div class="empty-state">' + Icons.icon('dumbbell', { size: 32 }) + '<p>Seu professor ainda não montou seu treino. Fale com a equipe na recepção.</p></div>';
      return;
    }

    // Aba padrão: o treino de hoje, senão o "geral" (dia_semana null), senão o primeiro.
    const hoje = new Date().getDay();
    state.treino = state.treinos.find((t) => t.dia_semana === hoje)
      || state.treinos.find((t) => t.dia_semana === null)
      || state.treinos[0];

    document.getElementById('treino-nome').textContent = state.treino.nome;
    document.getElementById('treino-desc').textContent = state.treino.descricao || '';
    renderTabs();
  } catch (err) {
    document.getElementById('lista-exercicios').innerHTML = '<div class="empty-state">Não foi possível carregar seu treino agora.</div>';
  }
}

async function carregarSessao() {
  try {
    state.sessao = await api.get('/api/sessoes/atual');
  } catch (err) {
    state.sessao = null;
  }
}

async function init() {
  await Promise.all([carregarTreino(), carregarSessao()]);

  // Se já tem um treino em andamento, abre nele em vez de "hoje" — evita
  // mostrar o tracker de séries zerado num treino que não é o da sessão.
  if (state.sessao && state.treino?.id !== state.sessao.treino_id) {
    const daSessao = state.treinos.find((t) => t.id === state.sessao.treino_id);
    if (daSessao) {
      state.treino = daSessao;
      document.getElementById('treino-nome').textContent = daSessao.nome;
      document.getElementById('treino-desc').textContent = daSessao.descricao || '';
    }
  }

  renderTabs();
  renderSessaoBar();
  renderExercicios();
}

document.getElementById('btn-iniciar-treino').addEventListener('click', async (ev) => {
  const btn = ev.currentTarget;
  setBtnLoading(btn, 'Iniciando...');
  try {
    state.sessao = await api.post('/api/sessoes/iniciar', { treino_id: state.treino.id });
    state.sessao.series_registradas = state.sessao.series_registradas || [];
    toast('Treino iniciado! Bora registrar cada série.', 'success');
    renderSessaoBar();
    renderExercicios();
  } catch (err) {
    toast(err.message || 'Erro ao iniciar treino.', 'error');
  } finally {
    resetBtnLoading(btn);
  }
});

document.getElementById('btn-finalizar-treino').addEventListener('click', async () => {
  if (!confirm('Finalizar o treino de hoje?')) return;
  const btn = document.getElementById('btn-finalizar-treino');
  setBtnLoading(btn, 'Finalizando...');
  try {
    const resultado = await api.patch(`/api/sessoes/${state.sessao.id}/finalizar`, {});
    const minutos = Math.round(resultado.duracao_segundos / 60);
    toast(`Treino finalizado! ${minutos} min · +${resultado.xp_ganho} XP`, 'success');
    state.sessao = null;
    renderSessaoBar();
    renderExercicios();
  } catch (err) {
    toast(err.message || 'Erro ao finalizar treino.', 'error');
  } finally {
    resetBtnLoading(btn);
  }
});

document.getElementById('lista-exercicios').addEventListener('click', (ev) => {
  const thumb = ev.target.closest('.video-thumb');
  if (thumb) {
    const id = thumb.dataset.youtubeId;
    thumb.outerHTML = `<iframe src="https://www.youtube.com/embed/${id}?autoplay=1" title="Vídeo do exercício" allowfullscreen allow="autoplay; encrypted-media" loading="lazy"></iframe>`;
    return;
  }

  const btnAbrir = ev.target.closest('[data-abrir-serie]');
  if (btnAbrir) {
    const id = btnAbrir.dataset.abrirSerie;
    document.getElementById(`serie-form-${id}`).style.display = 'flex';
    btnAbrir.replaceWith(Object.assign(document.createElement('span'), { className: 'serie-pill proxima', textContent: btnAbrir.textContent }));
    return;
  }

  const btnConfirmar = ev.target.closest('[data-confirmar-serie]');
  if (btnConfirmar) {
    confirmarSerie(btnConfirmar);
  }
});

async function confirmarSerie(btn) {
  const teId = Number(btn.dataset.confirmarSerie);
  const numero = Number(btn.dataset.numero);
  const reps = document.getElementById(`serie-reps-${teId}`).value;
  const carga = document.getElementById(`serie-carga-${teId}`).value;

  setBtnLoading(btn, '...');
  try {
    await api.post(`/api/sessoes/${state.sessao.id}/serie`, {
      treino_exercicio_id: teId,
      numero_serie: numero,
      repeticoes_realizadas: reps ? Number(reps) : null,
      carga_realizada: carga ? Number(carga) : null,
    });
    state.sessao.series_registradas.push({ treino_exercicio_id: teId, numero_serie: numero, repeticoes_realizadas: reps, carga_realizada: carga });

    const te = state.treino.exercicios.find((e) => e.id === teId);
    const totalSeries = Number(te?.series) || 1;
    const feitas = seriesFeitasDoExercicio(teId).length;
    const descanso = Number(te?.descanso_segundos) || 60;

    renderExercicios();

    if (feitas < totalSeries) {
      mostrarDescanso(teId, descanso);
    } else {
      toast('Exercício completo! 💪', 'success');
    }
  } catch (err) {
    toast(err.message || 'Erro ao registrar série.', 'error');
    resetBtnLoading(btn);
  }
}

function vibrarFimDescanso() {
  try {
    const haptics = window.Capacitor?.isNativePlatform?.() && window.Capacitor.Plugins?.Haptics;
    if (haptics) {
      haptics.vibrate({ duration: 300 });
    } else if (navigator.vibrate) {
      navigator.vibrate([120, 80, 120]);
    }
  } catch {
    /* sem suporte a vibração — segue sem alerta tátil */
  }
}

function mostrarDescanso(teId, segundos) {
  const el = document.getElementById(`serie-descanso-${teId}`);
  if (!el) return;
  el.style.display = 'block';
  const timeEl = el.querySelector('.serie-descanso-time');
  const fillEl = el.querySelector('.serie-descanso-fill');
  const total = segundos;
  let restante = segundos;
  timeEl.textContent = formatTempo(restante);
  fillEl.style.width = '100%';
  const iv = setInterval(() => {
    restante--;
    if (!document.body.contains(el)) return clearInterval(iv);
    timeEl.textContent = formatTempo(Math.max(restante, 0));
    fillEl.style.width = `${Math.max(restante, 0) / total * 100}%`;
    if (restante <= 0) {
      clearInterval(iv);
      el.style.display = 'none';
      vibrarFimDescanso();
    }
  }, 1000);
}

init();
