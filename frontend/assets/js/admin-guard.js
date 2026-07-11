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
    .then((res) => (res.ok ? res.json() : Promise.reject()))
    .then((user) => {
      if (!['admin', 'dono'].includes(user.role)) {
        window.location.href = '/dashboard.html';
        return;
      }

      const requiredRole = document.body.dataset.requireRole;
      if (requiredRole && user.role !== requiredRole) {
        window.location.href = 'index.html';
        return;
      }

      if (user.role !== 'dono') {
        document.querySelectorAll('[data-role-dono]').forEach((el) => {
          el.style.display = 'none';
        });
      }

      const sidebarFoot = document.querySelector('.sidebar-foot');
      if (sidebarFoot && typeof iniciais === 'function') {
        const roleLabel = user.role === 'dono' ? 'Dono da academia' : 'Administrador';
        const userEl = document.createElement('div');
        userEl.className = 'sidebar-user';
        userEl.innerHTML = `
          <span class="avatar-fallback">${iniciais(user.nome)}</span>
          <span class="sidebar-user-info">
            <strong>${user.nome}</strong>
            <span>${roleLabel}</span>
          </span>
        `;
        sidebarFoot.prepend(userEl);
      }

      window.tegUser = user;
      document.dispatchEvent(new CustomEvent('teg-user-ready', { detail: user }));
    })
    .catch(() => {
      localStorage.removeItem('token');
      window.location.href = '/login.html';
    });
})();
