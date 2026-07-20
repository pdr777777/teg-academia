// Fonte única do menu lateral do admin. Cada página inclui este script
// depois de ui.js e tem um <nav id="sidebar-nav"></nav> vazio pra receber o menu.
const SIDEBAR_MENU = [
  { href: 'index.html', icon: 'grid', label: 'Dashboard', role: 'adminup' },
  { href: 'alunos.html', icon: 'users', label: 'Alunos', role: 'adminup' },
  { href: 'ponto-de-venda.html', icon: 'shopping-cart', label: 'Ponto de venda', role: 'adminup' },
  { href: 'aulas.html', icon: 'clipboard-list', label: 'Aulas', role: 'adminup' },
  {
    label: 'Ficha de Treino',
    icon: 'dumbbell',
    children: [
      { href: 'exercicios.html', icon: 'dumbbell', label: 'Exercício' },
      { href: 'treinos.html', icon: 'clipboard-list', label: 'Template' },
      { href: 'automation-flow.html', icon: 'git-branch', label: 'Automation Flow' },
      { href: 'monitor-treino.html', icon: 'activity', label: 'Monitor de treino' },
    ],
  },
  { href: 'ranking.html', icon: 'award', label: 'Ranking' },
  { href: 'frequencia.html', icon: 'clock', label: 'Frequência' },
  { href: 'planos.html', icon: 'package', label: 'Planos', role: 'adminup' },
  { href: 'marketing-digital.html', icon: 'megaphone', label: 'Marketing Digital', role: 'adminup' },
  { href: 'crm.html', icon: 'columns', label: 'Pipeline de Vendas', role: 'adminup' },
  { href: 'financeiro.html', icon: 'wallet', label: 'Financeiro', role: 'dono' },
  { href: 'pagamentos.html', icon: 'credit-card', label: 'Faturas', role: 'adminup' },
  { href: 'relatorio.html', icon: 'file-text', label: 'Relatório', role: 'dono' },
  { href: 'equipe.html', icon: 'briefcase', label: 'Equipe', role: 'dono' },
  { href: 'configuracoes.html', icon: 'sliders', label: 'Configurações', role: 'adminup' },
  { href: 'suporte.html', icon: 'life-buoy', label: 'Suporte' },
];

function sidebarCurrentPage() {
  const path = window.location.pathname.split('/').pop();
  return path === '' ? 'index.html' : path;
}

function sidebarRoleAttr(role) {
  if (role === 'dono') return ' data-role-dono';
  if (role === 'adminup') return ' data-role-adminup';
  return '';
}

function sidebarRenderLink(item, current) {
  const activeAttr = item.href === current ? ' class="active"' : '';
  return `<a href="${item.href}"${activeAttr}${sidebarRoleAttr(item.role)}><span data-icon="${item.icon}" data-icon-size="18"></span>${item.label}</a>`;
}

function sidebarRenderGroup(item, current) {
  const isOpen = item.children.some((child) => child.href === current);
  const childrenHtml = item.children.map((child) => sidebarRenderLink(child, current)).join('');
  return `<div class="sidebar-nav-group${isOpen ? ' open' : ''}">
    <button type="button" class="sidebar-nav-group-toggle">
      <span data-icon="${item.icon}" data-icon-size="18"></span>
      <span class="sidebar-nav-group-label">${item.label}</span>
      <span class="sidebar-nav-group-chevron" data-icon="chevron-down" data-icon-size="14"></span>
    </button>
    <div class="sidebar-nav-submenu">${childrenHtml}</div>
  </div>`;
}

function renderSidebarNav() {
  const nav = document.getElementById('sidebar-nav');
  if (!nav) return;

  const current = sidebarCurrentPage();
  nav.innerHTML = SIDEBAR_MENU.map((item) =>
    item.children ? sidebarRenderGroup(item, current) : sidebarRenderLink(item, current)
  ).join('');

  if (typeof fillIcons === 'function') fillIcons(nav);

  nav.querySelectorAll('.sidebar-nav-group-toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
      btn.closest('.sidebar-nav-group').classList.toggle('open');
    });
  });
}

renderSidebarNav();
