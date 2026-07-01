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
  if (!data) return '—';
  return new Date(data).toLocaleDateString('pt-BR', { timeZone: 'UTC' });
}

function iniciais(nome) {
  if (!nome) return '?';
  return nome.trim().split(/\s+/).slice(0, 2).map((p) => p[0].toUpperCase()).join('');
}

function logout() {
  localStorage.removeItem('token');
  window.location.href = 'login.html';
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

document.addEventListener('DOMContentLoaded', () => {
  fillIcons();
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
