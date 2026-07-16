// Injeta o fundo animado Lightfall em qualquer página que carregue este script.
// Cria o container sozinho (não precisa de <div> manual em cada HTML) e só roda
// no tema escuro — em tema claro o efeito é escondido via CSS (lightfall.css).
document.addEventListener('DOMContentLoaded', () => {
  if (!window.initLightfall) return;

  const container = document.createElement('div');
  container.className = 'lightfall-container';
  container.id = 'lightfall-bg';
  document.body.insertBefore(container, document.body.firstChild);

  window.initLightfall(container, {
    colors: ['#bc0000'],
    backgroundColor: '#0a0a0a',
    speed: 0.4,
    streakCount: 4,
    streakWidth: 0.6,
    streakLength: 1.2,
    density: 0.5,
    twinkle: 0.05,
    glow: 3,
    backgroundGlow: 0.5,
    zoom: 2.2,
    opacity: 1,
    mouseInteraction: false,
  });
});
