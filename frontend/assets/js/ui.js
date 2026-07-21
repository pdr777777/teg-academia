function toast(mensagem, tipo = 'info') {
  let root = document.getElementById('toast-root');
  if (!root) {
    root = document.createElement('div');
    root.id = 'toast-root';
    document.body.appendChild(root);
  }
  const el = document.createElement('div');
  el.className = `toast${tipo === 'error' ? ' toast-error' : ''}${tipo === 'success' ? ' toast-success' : ''}`;
  el.textContent = mensagem;
  root.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}

function formatMoeda(valor) {
  return Number(valor || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatData(data) {
  if (!data) return '-';
  return new Date(data).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

// Escapa texto antes de injetar em innerHTML — obrigatório pra qualquer campo
// vindo do banco (nome, e-mail, plano...) já que muitos vêm de cadastro do
// próprio aluno ou de import externo (CloudGym), nunca confiável como HTML puro.
function escapeHtml(valor) {
  return String(valor ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

function iniciais(nome) {
  if (!nome) return '?';
  return nome.trim().split(/\s+/).slice(0, 2).map((p) => p[0].toUpperCase()).join('');
}

function renderAvatar(nome, fotoUrl, sizePx = 40) {
  if (fotoUrl) {
    return `<img src="${escapeHtml(fotoUrl)}" alt="${escapeHtml(nome)}" class="avatar-img" style="width:${sizePx}px;height:${sizePx}px" />`;
  }
  return `<span class="avatar-fallback" style="width:${sizePx}px;height:${sizePx}px;font-size:${Math.round(sizePx * 0.32)}px">${escapeHtml(iniciais(nome))}</span>`;
}

function logout() {
  localStorage.removeItem('token');
  window.location.href = '/login.html';
}

function debounce(fn, ms = 350) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

function fillIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach((el) => {
    if (el.dataset.iconDone) return;
    el.innerHTML = Icons.icon(el.dataset.icon, { size: Number(el.dataset.iconSize) || 18 });
    el.dataset.iconDone = '1';
  });
}

// Formata telefone conforme digita: (DD) DDDD-DDDD enquanto pode ser fixo,
// e assim que o 11º dígito entra, vira celular (DD) DDDDD-DDDD sozinho.
function maskTelefoneBR(valor) {
  const digitos = String(valor || '').replace(/\D/g, '').slice(0, 11);
  if (digitos.length > 10) {
    return digitos.replace(/^(\d{2})(\d{5})(\d{0,4}).*/, '($1) $2-$3');
  }
  return digitos.replace(/^(\d{0,2})(\d{0,4})(\d{0,4}).*/, (_, ddd, p1, p2) => {
    let out = '';
    if (ddd) out += `(${ddd}`;
    if (ddd.length === 2) out += ') ';
    if (p1) out += p1;
    if (p2) out += `-${p2}`;
    return out;
  });
}

function ativarMascaraTelefone(root = document) {
  root.querySelectorAll('input[type="tel"]').forEach((el) => {
    if (el.dataset.maskTelDone) return;
    el.dataset.maskTelDone = '1';
    el.addEventListener('input', () => { el.value = maskTelefoneBR(el.value); });
  });
}

document.addEventListener('DOMContentLoaded', () => {
  fillIcons();
  ativarMascaraTelefone();
  const menuBtn = document.getElementById('btn-mobile-menu');
  const links = document.querySelector('.topnav-links');
  if (menuBtn && links) {
    menuBtn.addEventListener('click', () => links.classList.toggle('open'));
  }

  const sidebarToggle = document.getElementById('btn-sidebar-toggle');
  const sidebar = document.getElementById('sidebar');
  if (sidebarToggle && sidebar) {
    sidebarToggle.addEventListener('click', () => sidebar.classList.toggle('open'));
  }

  const logoutLink = document.getElementById('btn-logout');
  if (logoutLink && logoutLink.tagName === 'A') {
    logoutLink.addEventListener('click', (ev) => {
      ev.preventDefault();
      logout();
    });
  }
});
