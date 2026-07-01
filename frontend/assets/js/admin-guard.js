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
      }
    })
    .catch(() => {
      localStorage.removeItem('token');
      window.location.href = '/login.html';
    });
})();
