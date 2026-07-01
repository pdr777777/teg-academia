// Redireciona para login se não tiver token
(function () {
  const token = localStorage.getItem('token');
  if (!token) {
    window.location.href = '/login.html';
  }
})();
