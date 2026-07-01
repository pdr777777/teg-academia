document.getElementById('form-login').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const btn = ev.target.querySelector('button[type="submit"]');
  btn.disabled = true;
  btn.textContent = 'Entrando...';

  try {
    const { token, user } = await api.post('/api/auth/login', {
      email: document.getElementById('email').value,
      senha: document.getElementById('senha').value,
    });
    localStorage.setItem('token', token);
    window.location.href = ['admin', 'dono'].includes(user.role) ? 'admin/index.html' : 'dashboard.html';
  } catch (err) {
    toast(err.message || 'Não foi possível entrar.', 'error');
    btn.disabled = false;
    btn.textContent = 'Entrar';
  }
});
