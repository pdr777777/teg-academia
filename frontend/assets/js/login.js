/* ===== Abas Entrar / Criar conta (mesma página, sem reload) ===== */
(function initAuthTabs() {
  const tabsEl = document.getElementById('auth-tabs');
  if (!tabsEl) return;

  const panels = document.querySelectorAll('.auth-panel');

  function activate(name, opts) {
    opts = opts || {};
    tabsEl.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.panel === name));
    panels.forEach((p) => p.classList.toggle('active', p.dataset.panel === name));
    if (opts.updateHash !== false) {
      const hash = name === 'criar-conta' ? '#criar-conta' : '';
      history.replaceState(null, '', window.location.pathname + hash);
    }
  }

  initTabsIndicator(tabsEl, { gooey: true });

  tabsEl.addEventListener('click', (ev) => {
    const tab = ev.target.closest('.tab');
    if (tab) activate(tab.dataset.panel);
  });

  if (window.location.hash === '#criar-conta') {
    activate('criar-conta', { updateHash: false });
  }
})();

let intervaloBloqueio = null;

function formatarTempoRestante(ms) {
  const totalSegundos = Math.max(0, Math.ceil(ms / 1000));
  const min = Math.floor(totalSegundos / 60);
  const seg = totalSegundos % 60;
  return `${min}m ${String(seg).padStart(2, '0')}s`;
}

function ativarBloqueio(bloqueadoAte) {
  const form = document.getElementById('form-login');
  const msg = document.getElementById('login-bloqueio-msg');
  const link = document.getElementById('link-esqueci-senha');
  const btn = document.getElementById('btn-login');

  form.email.disabled = true;
  form.senha.disabled = true;
  btn.disabled = true;
  link.classList.add('destaque');
  msg.style.display = 'block';

  const alvo = new Date(bloqueadoAte).getTime();

  function tick() {
    const restante = alvo - Date.now();
    if (restante <= 0) {
      clearInterval(intervaloBloqueio);
      form.email.disabled = false;
      form.senha.disabled = false;
      btn.disabled = false;
      link.classList.remove('destaque');
      msg.style.display = 'none';
      return;
    }
    msg.textContent = `Muitas tentativas erradas. Tente novamente em ${formatarTempoRestante(restante)}, ou redefina sua senha abaixo.`;
  }

  clearInterval(intervaloBloqueio);
  tick();
  intervaloBloqueio = setInterval(tick, 1000);
}

document.getElementById('form-login').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const btn = ev.target.querySelector('button[type="submit"]');
  setBtnLoading(btn, 'Entrando...');

  try {
    const { token, user } = await api.post('/api/auth/login', {
      email: document.getElementById('login-email').value,
      senha: document.getElementById('login-senha').value,
    });
    localStorage.setItem('token', token);
    if (['admin', 'dono'].includes(user.role)) {
      window.location.href = 'admin/index.html';
    } else if (user.role === 'professor') {
      window.location.href = 'admin/treinos.html';
    } else {
      window.location.href = 'dashboard.html';
    }
  } catch (err) {
    toast(err.message || 'Não foi possível entrar.', 'error');
    resetBtnLoading(btn);
    if (err.status === 429 && err.data && err.data.bloqueado) {
      ativarBloqueio(err.data.bloqueado_ate);
    }
  }
});
