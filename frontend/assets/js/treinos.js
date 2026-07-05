document.getElementById('btn-logout').addEventListener('click', logout);

function embedVideo(url) {
  if (!url) return `<div class="play-placeholder">${Icons.icon('play', { size: 28 })}<span>Vídeo em breve</span></div>`;
  const youtubeMatch = url.match(/(?:youtu\.be\/|v=)([\w-]{11})/);
  if (youtubeMatch) {
    return `<iframe src="https://www.youtube.com/embed/${youtubeMatch[1]}" title="Vídeo do exercício" allowfullscreen loading="lazy"></iframe>`;
  }
  return `<video src="${url}" controls></video>`;
}

async function carregarTreino() {
  const lista = document.getElementById('lista-exercicios');
  try {
    const treinos = await api.get('/api/treinos/meu');
    const treino = treinos[0];

    if (!treino) {
      document.getElementById('treino-desc').textContent = 'Nenhum treino atribuído ainda.';
      lista.innerHTML = '<div class="empty-state">' + Icons.icon('dumbbell', { size: 32 }) + '<p>Seu professor ainda não montou seu treino. Fale com a equipe na recepção.</p></div>';
      return;
    }

    document.getElementById('treino-nome').textContent = treino.nome;
    document.getElementById('treino-desc').textContent = treino.descricao || '';

    const exercicios = (treino.exercicios || []).filter((e) => e.exercicio);
    if (!exercicios.length) {
      lista.innerHTML = '<div class="empty-state">Nenhum exercício cadastrado neste treino.</div>';
      return;
    }

    lista.innerHTML = exercicios.map((te) => `
      <div class="card exercicio-card" data-reveal>
        <div class="exercicio-video">${embedVideo(te.exercicio.video_url)}</div>
        <div class="exercicio-body">
          <div class="exercicio-head">
            <h3>${te.exercicio.nome}</h3>
            <span class="badge badge-muted">${te.exercicio.grupo_muscular || ''}</span>
          </div>
          <div class="exercicio-stats">
            <div class="exercicio-stat"><strong>${te.series}</strong><span>Séries</span></div>
            <div class="exercicio-stat"><strong>${te.repeticoes}</strong><span>Repetições</span></div>
            <div class="exercicio-stat"><strong>${te.carga ? te.carga + ' kg' : '—'}</strong><span>Carga</span></div>
            <div class="exercicio-stat"><strong>${te.descanso_segundos ? te.descanso_segundos + 's' : '—'}</strong><span>Descanso</span></div>
          </div>
          ${te.observacoes ? `<div class="exercicio-obs">${te.observacoes}</div>` : ''}
        </div>
      </div>
    `).join('');
    initReveal();
  } catch (err) {
    lista.innerHTML = '<div class="empty-state">Não foi possível carregar seu treino agora.</div>';
  }
}

carregarTreino();
