// No app nativo (Capacitor), o WebView serve o conteúdo em https://localhost —
// window.location.hostname bateria com 'localhost' e apontaria pro loopback
// do próprio celular em vez do Railway. Só usa localhost:3001 no navegador real.
const isAppNativo = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
const API_URL = (!isAppNativo && window.location.hostname === 'localhost')
  ? 'http://localhost:3001'
  : 'https://teg-academia-backend-production.up.railway.app';

async function apiFetch(path, options = {}) {
  const token = localStorage.getItem('token');
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  const data = await res.json();

  if (!res.ok) throw new Error(data.error || 'Erro na requisição');
  return data;
}

const api = {
  get: (path) => apiFetch(path),
  post: (path, body) => apiFetch(path, { method: 'POST', body: JSON.stringify(body) }),
  patch: (path, body) => apiFetch(path, { method: 'PATCH', body: JSON.stringify(body) }),
  put: (path, body) => apiFetch(path, { method: 'PUT', body: JSON.stringify(body) }),
  del: (path) => apiFetch(path, { method: 'DELETE' }),
};
