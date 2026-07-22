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
    .then((res) => {
      if (res.ok) return;
      // Resposta real do servidor dizendo que o token é inválido/expirado —
      // isso sim desloga. Falha de rede (abaixo, no catch) não conta.
      localStorage.removeItem('token');
      window.location.href = '/login.html';
    })
    .catch(() => {
      // Sem resposta do servidor (offline, timeout, DNS) — a sessão pode
      // ser perfeitamente válida, só não dá pra confirmar agora. Não desloga:
      // o app roda em WebView dentro da academia, onde sinal ruim é comum, e
      // derrubar o login por uma soneca de conexão seria pior que só seguir
      // com o token que já está salvo.
    });
})();
