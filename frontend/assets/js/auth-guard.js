(function () {
  const token = localStorage.getItem('token');
  if (!token) {
    window.location.href = '/login.html';
    return;
  }

  const base = typeof API_URL !== 'undefined' ? API_URL : 'http://localhost:3001';
  fetch(`${base}/api/auth/me`, {
    headers: { Authorization: `Bearer ${token}` },
  })
    .then((res) => (res.ok ? null : Promise.reject()))
    .catch(() => {
      localStorage.removeItem('token');
      window.location.href = '/login.html';
    });
})();
