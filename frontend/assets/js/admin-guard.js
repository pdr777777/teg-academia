// Redireciona para login se não tiver token, ou para a área do aluno se não for admin/dono
(function () {
  const token = localStorage.getItem('token');
  if (!token) {
    window.location.href = '/login.html';
    return;
  }

  fetch(`${typeof API_URL !== 'undefined' ? API_URL : 'http://localhost:3001'}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  })
    .then((res) => {
      if (res.ok) return res.json();
      // Resposta real do servidor negando o token — essa sim desloga.
      const err = new Error('token inválido');
      err.tokenInvalido = true;
      throw err;
    })
    .then((user) => {
      if (!['admin', 'dono', 'professor'].includes(user.role)) {
        window.location.href = '/dashboard.html';
        return;
      }

      const requiredRole = document.body.dataset.requireRole;
      if (requiredRole && user.role !== requiredRole) {
        window.location.href = user.role === 'professor' ? 'treinos.html' : 'index.html';
        return;
      }

      if (user.role !== 'dono') {
        document.querySelectorAll('[data-role-dono]').forEach((el) => {
          el.style.display = 'none';
        });
      }
      if (user.role === 'professor') {
        document.querySelectorAll('[data-role-adminup]').forEach((el) => {
          el.style.display = 'none';
        });
      }

      const sidebarFoot = document.querySelector('.sidebar-foot');
      if (sidebarFoot && typeof iniciais === 'function') {
        const roleLabel = user.role === 'dono' ? 'Dono da academia' : user.role === 'professor' ? 'Professor' : 'Administrador';
        const userEl = document.createElement('div');
        userEl.className = 'sidebar-user';
        userEl.innerHTML = `
          <span class="avatar-fallback">${escapeHtml(iniciais(user.nome))}</span>
          <span class="sidebar-user-info">
            <strong>${escapeHtml(user.nome)}</strong>
            <span>${escapeHtml(roleLabel)}</span>
          </span>
        `;
        sidebarFoot.prepend(userEl);
      }

      window.tegUser = user;
      document.dispatchEvent(new CustomEvent('teg-user-ready', { detail: user }));
    })
    .catch((err) => {
      // Falha de rede (offline, timeout) não desloga — só um token
      // explicitamente rejeitado pelo servidor conta. O app roda em WebView
      // dentro da academia, onde sinal ruim é comum; derrubar o login por
      // uma soneca de conexão seria pior que só seguir com o token salvo.
      if (err && err.tokenInvalido) {
        localStorage.removeItem('token');
        window.location.href = '/login.html';
      }
    });
})();
