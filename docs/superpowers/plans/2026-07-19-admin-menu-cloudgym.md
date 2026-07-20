# Reestruturação do menu admin (Fase 1 — paridade CloudGym) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reestruturar a navegação do painel admin do TEG pra ter os mesmos itens/submenu que o CloudGym (Dashboard, Alunos, Ponto de venda, Aulas, Ficha de Treino ▾, Ranking, Frequência, Planos, Marketing Digital, Pipeline de Vendas, Financeiro, Faturas, Relatório, Equipe, Configurações, Suporte), com um componente de menu central em vez de HTML duplicado em cada página, placeholders nas telas que ainda não existem, e um fluxo real de "Novo Cliente" em Alunos.

**Architecture:** Um novo `sidebar-nav.js` define a lista de itens do menu numa config e injeta o HTML dentro de um `<nav id="sidebar-nav">` vazio que cada página passa a ter. As 12 páginas admin existentes trocam o bloco de nav hardcoded por essa injeção (feito via script de migração mecânico, não editado item por item). 7 páginas novas (placeholder "em construção") são criadas seguindo o shell padrão. Alunos ganha um fluxo de cadastro de cliente que reaproveita o endpoint público `/api/auth/registro` já existente — nenhuma rota de backend nova.

**Tech Stack:** HTML/CSS/JS vanilla (sem framework, sem bundler). Não existe test runner pro frontend neste repo (só o backend tem Jest) — a verificação de cada task é manual: rodar `npx serve frontend` (porta 3000) com o backend local em paralelo (`cd backend && npm run dev`, porta 3001) e abrir as páginas no navegador, como documentado em `README.md`.

## Global Constraints

- Nenhuma rota de backend nova nesta fase (spec, seção "Fora de escopo").
- Nenhuma mudança visual/estética (cores, tipografia) — só estrutura de navegação (spec, seção "Fora de escopo").
- Itens novos sem funcionalidade real usam o placeholder padrão "Em construção" (spec, seção "Páginas — o que muda em cada uma").
- `data-role-dono` esconde o elemento pra quem não é `dono`; `data-role-adminup` esconde pra `professor` (comportamento existente de `admin-guard.js`, preservado).

---

## Task 1: Componente central de menu (sidebar-nav.js) + wiring na Dashboard

**Files:**
- Modify: `frontend/assets/js/icons.js`
- Modify: `frontend/assets/css/global.css`
- Create: `frontend/assets/js/sidebar-nav.js`
- Modify: `frontend/admin/index.html`

**Interfaces:**
- Produces: `window` global function `fillIcons(root)` já existe em `frontend/assets/js/ui.js:42` — `sidebar-nav.js` consome essa função (precisa carregar depois de `ui.js`).
- Produces: `sidebar-nav.js` roda automaticamente ao ser carregado (side-effect, sem export) — injeta o menu em `document.getElementById('sidebar-nav')`. Tasks seguintes (2 e 3) dependem de cada página ter esse `<nav id="sidebar-nav"></nav>` vazio e incluir `<script src="../assets/js/sidebar-nav.js"></script>` depois de `ui.js`.

- [ ] **Step 1: Adicionar os ícones novos em `icons.js`**

Abrir `frontend/assets/js/icons.js` e adicionar estas entradas dentro do objeto `ICONS` (antes da linha `bell: ...`, mantendo o mesmo estilo das demais):

```js
  'shopping-cart': '<circle cx="9" cy="20" r="1.4" fill="currentColor" stroke="none"/><circle cx="18" cy="20" r="1.4" fill="currentColor" stroke="none"/><path d="M2.5 3h2.4l2.4 12.2a2 2 0 0 0 2 1.6h8.6a2 2 0 0 0 2-1.6L21.5 7H6"/>',
  megaphone: '<path d="M3 11l18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/>',
  'git-branch': '<line x1="6" y1="3" x2="6" y2="15"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/>',
  activity: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
  receipt: '<path d="M6 2h12a1 1 0 0 1 1 1v18l-2.5-1.5L14 21l-2-1.5L10 21l-2.5-1.5L5 21V3a1 1 0 0 1 1-1z"/><line x1="8" y1="7" x2="16" y2="7"/><line x1="8" y1="11" x2="16" y2="11"/><line x1="8" y1="15" x2="13" y2="15"/>',
  'life-buoy': '<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="4"/><line x1="4.93" y1="4.93" x2="9.17" y2="9.17"/><line x1="14.83" y1="14.83" x2="19.07" y2="19.07"/><line x1="14.83" y1="9.17" x2="19.07" y2="4.93"/><line x1="4.93" y1="19.07" x2="9.17" y2="14.83"/>',
  'file-text': '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/>',
```

- [ ] **Step 2: Adicionar CSS do submenu em `global.css`**

Em `frontend/assets/css/global.css`, logo depois da linha `.sidebar-foot a:hover { background: var(--color-surface-2); color: var(--color-danger); }` (linha 418) e antes de `.main-content { ... }` (linha 419), adicionar:

```css
.sidebar-nav-group-toggle {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  width: 100%;
  padding: 0.65rem 0.75rem;
  border-radius: var(--radius-sm);
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--color-muted);
  background: none;
  border: none;
  cursor: pointer;
  font-family: inherit;
  text-align: left;
}
.sidebar-nav-group-toggle:hover { background: var(--color-surface-2); color: var(--color-text); }
.sidebar-nav-group-label { flex: 1; }
.sidebar-nav-group-chevron { transition: transform 0.15s; flex-shrink: 0; }
.sidebar-nav-group.open .sidebar-nav-group-chevron { transform: rotate(180deg); }
.sidebar-nav-submenu { display: none; flex-direction: column; gap: 0.15rem; padding-left: 1.6rem; }
.sidebar-nav-group.open .sidebar-nav-submenu { display: flex; }
.sidebar-nav-submenu a { padding: 0.5rem 0.75rem; font-size: 0.85rem; }
```

- [ ] **Step 3: Criar `frontend/assets/js/sidebar-nav.js`**

```js
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
```

- [ ] **Step 4: Ligar o componente em `index.html`**

Em `frontend/admin/index.html`, substituir o bloco (linhas 20-33):

```html
      <nav class="sidebar-nav">
        <a href="index.html" class="active" data-role-adminup><span data-icon="grid" data-icon-size="18"></span>Dashboard</a>
        <a href="financeiro.html" data-role-dono><span data-icon="wallet" data-icon-size="18"></span>Financeiro</a>
        <a href="alunos.html" data-role-adminup><span data-icon="users" data-icon-size="18"></span>Alunos</a>
        <a href="ranking.html"><span data-icon="award" data-icon-size="18"></span>Ranking</a>
        <a href="frequencia.html"><span data-icon="clock" data-icon-size="18"></span>Frequência</a>
        <a href="treinos.html"><span data-icon="dumbbell" data-icon-size="18"></span>Treinos</a>
        <a href="aulas.html" data-role-adminup><span data-icon="clipboard-list" data-icon-size="18"></span>Aulas</a>
        <a href="planos.html" data-role-adminup><span data-icon="package" data-icon-size="18"></span>Planos</a>
        <a href="crm.html" data-role-adminup><span data-icon="columns" data-icon-size="18"></span>CRM</a>
        <a href="pagamentos.html" data-role-adminup><span data-icon="credit-card" data-icon-size="18"></span>Pagamentos</a>
        <a href="equipe.html" data-role-dono><span data-icon="briefcase" data-icon-size="18"></span>Equipe</a>
        <a href="configuracoes.html" data-role-adminup><span data-icon="sliders" data-icon-size="18"></span>Configurações</a>
      </nav>
```

por:

```html
      <nav class="sidebar-nav" id="sidebar-nav"></nav>
```

E, na lista de scripts no fim do arquivo, adicionar `sidebar-nav.js` depois de `ui.js`:

```html
  <script src="../assets/js/icons.js"></script>
  <script src="../assets/js/api.js"></script>
  <script src="../assets/js/ui.js"></script>
  <script src="../assets/js/sidebar-nav.js"></script>
  <script src="../assets/js/app-effects.js"></script>
  <script src="../assets/js/admin-guard.js"></script>
  <script src="../assets/js/admin-dashboard.js"></script>
```

- [ ] **Step 5: Verificar manualmente**

Rodar em dois terminais:

```bash
cd backend && npm run dev
```
```bash
npx serve frontend
```

Abrir `http://localhost:3000/admin/index.html`, logar como dono. Confirmar:
- O menu aparece completo, na ordem definida em `SIDEBAR_MENU`, com "Dashboard" destacado como ativo.
- "Ficha de Treino" aparece como item expansível com a seta; clicar abre/fecha o submenu com Exercício, Template, Automation Flow, Monitor de treino.
- Nenhum erro no console do navegador.

- [ ] **Step 6: Commit**

```bash
git add frontend/assets/js/icons.js frontend/assets/css/global.css frontend/assets/js/sidebar-nav.js frontend/admin/index.html
git commit -m "feat(admin): componente central de menu lateral com submenu Ficha de Treino"
```

---

## Task 2: Migrar as 11 páginas admin restantes pro menu central

**Files:**
- Create (temporário): `scripts/migrate-admin-sidebar.js`
- Modify: `frontend/admin/alunos.html`, `frontend/admin/financeiro.html`, `frontend/admin/ranking.html`, `frontend/admin/frequencia.html`, `frontend/admin/treinos.html`, `frontend/admin/aulas.html`, `frontend/admin/planos.html`, `frontend/admin/crm.html`, `frontend/admin/pagamentos.html`, `frontend/admin/equipe.html`, `frontend/admin/configuracoes.html`

**Interfaces:**
- Consumes: `sidebar-nav.js` (Task 1) — cada página passa a incluí-lo e a ter `<nav class="sidebar-nav" id="sidebar-nav"></nav>` vazio, igual ao que foi feito em `index.html`.

- [ ] **Step 1: Criar o script de migração**

Criar `scripts/migrate-admin-sidebar.js`:

```js
const fs = require('fs');
const path = require('path');

const files = [
  'alunos.html', 'financeiro.html', 'ranking.html', 'frequencia.html',
  'treinos.html', 'aulas.html', 'planos.html', 'crm.html',
  'pagamentos.html', 'equipe.html', 'configuracoes.html',
];

const dir = path.join(__dirname, '..', 'frontend', 'admin');
const navRegex = /<nav class="sidebar-nav">[\s\S]*?<\/nav>/;
const uiScriptRegex = /( {2}<script src="\.\.\/assets\/js\/ui\.js"><\/script>\n)/;

for (const file of files) {
  const filePath = path.join(dir, file);
  let html = fs.readFileSync(filePath, 'utf8');

  if (!navRegex.test(html)) throw new Error(`Bloco <nav class="sidebar-nav"> não encontrado em ${file}`);
  html = html.replace(navRegex, '<nav class="sidebar-nav" id="sidebar-nav"></nav>');

  if (!uiScriptRegex.test(html)) throw new Error(`Script ui.js não encontrado em ${file}`);
  html = html.replace(uiScriptRegex, '$1  <script src="../assets/js/sidebar-nav.js"></script>\n');

  fs.writeFileSync(filePath, html);
  console.log(`OK: ${file}`);
}
```

- [ ] **Step 2: Rodar o script**

Run: `node scripts/migrate-admin-sidebar.js`
Expected: imprime `OK: <nome>` pras 11 páginas, sem lançar erro.

- [ ] **Step 3: Conferir o resultado com git diff**

Run: `git diff --stat frontend/admin`
Expected: as 11 páginas aparecem modificadas. Abrir o diff de uma delas (`git diff frontend/admin/alunos.html`) e confirmar visualmente que só o bloco `<nav>` e a linha do script mudaram — nada mais no restante do arquivo.

- [ ] **Step 4: Apagar o script de migração (era só pra essa transformação pontual)**

```bash
rm scripts/migrate-admin-sidebar.js
```

- [ ] **Step 5: Verificar manualmente**

Com `npm run dev` (backend) e `npx serve frontend` já rodando (Task 1), abrir cada uma das 11 páginas migradas (ex: `http://localhost:3000/admin/alunos.html`, `.../treinos.html`, `.../crm.html`) e confirmar:
- O menu aparece igual em todas, com o item correto destacado como ativo em cada página (`treinos.html` acende "Template" dentro de "Ficha de Treino" já expandido; `crm.html` mostra label "Pipeline de Vendas"; `pagamentos.html` mostra label "Faturas").
- Nenhum erro no console.

- [ ] **Step 6: Commit**

```bash
git add frontend/admin
git commit -m "refactor(admin): migra as páginas restantes pro menu lateral central"
```

---

## Task 3: Páginas placeholder novas

**Files:**
- Create: `frontend/admin/ponto-de-venda.html`
- Create: `frontend/admin/exercicios.html`
- Create: `frontend/admin/automation-flow.html`
- Create: `frontend/admin/monitor-treino.html`
- Create: `frontend/admin/marketing-digital.html`
- Create: `frontend/admin/relatorio.html`
- Create: `frontend/admin/suporte.html`

**Interfaces:**
- Consumes: `sidebar-nav.js` (Task 1) — cada página nova usa o mesmo shell (`<nav id="sidebar-nav">` vazio + script), e o item ativo é detectado automaticamente pelo nome do arquivo (não precisa marcar `class="active"` manualmente).

- [ ] **Step 1: Criar as 7 páginas**

Cada uma segue exatamente este template, trocando `{{TITLE}}`, `{{DESC}}` e `{{ICON}}` conforme a tabela abaixo:

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <title>{{TITLE}} - Admin</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
  <link rel="icon" type="image/png" href="../assets/img/favicon.png" />
  <link rel="stylesheet" href="../assets/css/global.css" />
  <link rel="stylesheet" href="../assets/css/admin.css" />
  <link rel="stylesheet" href="../assets/css/app-effects.css" />
  <script src="../assets/js/theme.js"></script>
</head>
<body>

  <div class="app-shell">
    <aside class="sidebar" id="sidebar">
      <a href="../index.html" class="brand" title="Voltar para o site"><img src="../assets/img/logo.svg" alt="TEG Academia" class="brand-logo" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" /><span class="brand-fallback"><span class="dot"></span>TEG ADMIN</span></a>
      <nav class="sidebar-nav" id="sidebar-nav"></nav>
      <div class="sidebar-foot">
        <button type="button" id="btn-theme-toggle" data-theme-toggle class="btn btn-ghost btn-sm btn-block" data-icon="sun" data-icon-size="16" style="justify-content:flex-start;gap:0.7rem;padding:0.65rem 0.75rem;color:var(--color-muted)">Tema</button>
        <a href="#" id="btn-logout"><span data-icon="log-out" data-icon-size="18"></span>Sair</a>
      </div>
    </aside>

    <div class="main-content">
      <div class="page-head">
        <button class="btn btn-ghost btn-sm sidebar-toggle" id="btn-sidebar-toggle" data-icon="menu"></button>
        <div>
          <h1>{{TITLE}}</h1>
          <p>{{DESC}}</p>
        </div>
      </div>

      <div class="card" style="text-align:center;padding:3rem 1.5rem" data-reveal>
        <span data-icon="{{ICON}}" data-icon-size="32" style="color:var(--color-muted);margin-bottom:1rem;display:inline-block"></span>
        <h2 style="margin-bottom:.5rem">Em construção</h2>
        <p class="text-muted">Essa função está chegando em breve.</p>
      </div>
    </div>
  </div>

  <script src="../assets/js/icons.js"></script>
  <script src="../assets/js/api.js"></script>
  <script src="../assets/js/ui.js"></script>
  <script src="../assets/js/sidebar-nav.js"></script>
  <script src="../assets/js/app-effects.js"></script>
  <script src="../assets/js/admin-guard.js"></script>
</body>
</html>
```

| Arquivo | `{{TITLE}}` | `{{DESC}}` | `{{ICON}}` |
|---|---|---|---|
| `ponto-de-venda.html` | Ponto de venda | Registre vendas rápidas de produtos, planos e serviços. | shopping-cart |
| `exercicios.html` | Exercício | Biblioteca de exercícios usada para montar os treinos. | dumbbell |
| `automation-flow.html` | Automation Flow | Fluxos automáticos de periodização de treino. | git-branch |
| `monitor-treino.html` | Monitor de treino | Acompanhe o progresso dos treinos dos alunos em tempo real. | activity |
| `marketing-digital.html` | Marketing Digital | Campanhas e automações de marketing. | megaphone |
| `relatorio.html` | Relatório | Relatórios consolidados do negócio. | file-text |
| `suporte.html` | Suporte | Central de ajuda e suporte. | life-buoy |

- [ ] **Step 2: Verificar manualmente**

Com o servidor local rodando, abrir cada uma das 7 URLs (ex: `http://localhost:3000/admin/ponto-de-venda.html`) e confirmar:
- O menu aparece com o item correspondente destacado (inclusive o submenu "Ficha de Treino" abrindo sozinho em `exercicios.html`, `automation-flow.html` e `monitor-treino.html`).
- O card "Em construção" aparece centralizado com o ícone certo.
- Nenhum erro no console.

- [ ] **Step 3: Commit**

```bash
git add frontend/admin/ponto-de-venda.html frontend/admin/exercicios.html frontend/admin/automation-flow.html frontend/admin/monitor-treino.html frontend/admin/marketing-digital.html frontend/admin/relatorio.html frontend/admin/suporte.html
git commit -m "feat(admin): páginas placeholder pros itens novos do menu (paridade CloudGym)"
```

---

## Task 4: Fluxo "Novo Cliente" em Alunos

**Files:**
- Modify: `frontend/admin/alunos.html`
- Modify: `frontend/assets/js/admin-alunos.js`

**Interfaces:**
- Consumes: `POST /api/auth/registro` (`backend/src/routes/auth.js:27`) — body `{ nome, email, senha, telefone }`, retorna `{ token, user: { id, nome, email, role, link_indicacao } }`. Rota pública, sem `authMiddleware`.
- Consumes: `POST /api/admin/matriculas` (já usado pelo dialog de matrícula existente) via a função `abrirDialogMatricula`, que este task refatora de `abrirDialogMatricula(btn)` pra `abrirDialogMatricula(usuarioId, nome, matriculaId = '')`.
- Produces: nada consumido por tasks futuras desta fase.

- [ ] **Step 1: Adicionar o botão "Novo Cliente" e o dialog em `alunos.html`**

Nota: a Task 2 já reescreveu o topo deste arquivo (bloco `<nav>` + script), então os números de linha originais não valem mais aqui — localize os blocos abaixo pelo conteúdo, não pela linha.

Em `frontend/admin/alunos.html`, no bloco `.filters-row`, trocar:

```html
      <div class="filters-row">
        <div class="search-field">
          <span data-icon="search" data-icon-size="16"></span>
          <input type="text" id="busca-aluno" placeholder="Buscar por nome ou e-mail..." />
        </div>
      </div>
```

por:

```html
      <div class="filters-row">
        <div class="search-field">
          <span data-icon="search" data-icon-size="16"></span>
          <input type="text" id="busca-aluno" placeholder="Buscar por nome ou e-mail..." />
        </div>
        <button class="btn btn-primary" id="btn-novo-cliente" data-role-adminup>
          <span data-icon="user-plus" data-icon-size="16"></span>Novo Cliente
        </button>
      </div>
```

Antes do `<dialog id="dialog-matricula">` existente, adicionar o novo dialog:

```html
  <dialog id="dialog-novo-cliente" class="admin-dialog">
    <form id="form-novo-cliente" method="dialog">
      <h2>Novo cliente</h2>

      <label class="field-label">Nome completo <span class="text-danger">*</span></label>
      <input type="text" id="nc-nome" class="input" placeholder="Nome do cliente" required />

      <label class="field-label" style="margin-top:1rem">E-mail <span class="text-danger">*</span></label>
      <input type="email" id="nc-email" class="input" placeholder="email@exemplo.com" required />

      <label class="field-label" style="margin-top:1rem">Telefone</label>
      <input type="tel" id="nc-telefone" class="input" placeholder="(00) 00000-0000" />

      <label class="field-label" style="margin-top:1rem">Senha temporária</label>
      <div class="row gap-sm">
        <input type="text" id="nc-senha" class="input" readonly style="flex:1" />
        <button type="button" class="btn btn-ghost btn-sm" id="btn-nc-copiar-senha" title="Copiar senha">
          <span data-icon="copy" data-icon-size="14"></span>
        </button>
      </div>
      <p class="text-muted" style="font-size:.78rem;margin-top:.35rem">Repasse essa senha ao cliente — ele pode trocá-la depois em "Esqueci minha senha".</p>

      <div class="dialog-actions">
        <button type="button" class="btn btn-ghost" id="btn-nc-cancel">Cancelar</button>
        <button type="submit" class="btn btn-primary" id="btn-nc-confirm">Cadastrar e matricular</button>
      </div>
    </form>
  </dialog>

```

- [ ] **Step 2: Refatorar `abrirDialogMatricula` em `admin-alunos.js` pra aceitar argumentos em vez de um botão**

Em `frontend/assets/js/admin-alunos.js`, trocar a função (linhas 109-131):

```js
async function abrirDialogMatricula(btn) {
  const usuarioId = btn.dataset.matId;
  const nome = btn.dataset.matNome;
  const matriculaId = btn.dataset.matMatriculaId || '';

  document.getElementById('dialog-titulo').textContent = matriculaId
    ? `Renovar matrícula: ${nome}`
    : `Matricular: ${nome}`;

  inputUsuarioId.value = usuarioId;
  inputMatriculaId.value = matriculaId;
  selMetodo.value = '';

  try {
    const planos = await carregarPlanos();
    selPlano.innerHTML = planos.map((p) => `<option value="${p.id}">${p.nome} (${formatMoeda(p.preco_mensal)}/mês)</option>`).join('');
  } catch {
    toast('Erro ao carregar planos.', 'error');
    return;
  }

  dialog.showModal();
}
```

por:

```js
async function abrirDialogMatricula(usuarioId, nome, matriculaId = '') {
  document.getElementById('dialog-titulo').textContent = matriculaId
    ? `Renovar matrícula: ${nome}`
    : `Matricular: ${nome}`;

  inputUsuarioId.value = usuarioId;
  inputMatriculaId.value = matriculaId;
  selMetodo.value = '';

  try {
    const planos = await carregarPlanos();
    selPlano.innerHTML = planos.map((p) => `<option value="${p.id}">${p.nome} (${formatMoeda(p.preco_mensal)}/mês)</option>`).join('');
  } catch {
    toast('Erro ao carregar planos.', 'error');
    return;
  }

  dialog.showModal();
}
```

E atualizar o único ponto que chama essa função (linhas 92-96):

```js
  // Matricular / Renovar
  const btnMat = ev.target.closest('[data-mat-id]');
  if (btnMat) {
    await abrirDialogMatricula(btnMat);
  }
```

por:

```js
  // Matricular / Renovar
  const btnMat = ev.target.closest('[data-mat-id]');
  if (btnMat) {
    await abrirDialogMatricula(btnMat.dataset.matId, btnMat.dataset.matNome, btnMat.dataset.matMatriculaId || '');
  }
```

- [ ] **Step 3: Adicionar a lógica do dialog "Novo Cliente" em `admin-alunos.js`**

No fim de `frontend/assets/js/admin-alunos.js` (depois do `carregarAlunos();` da última linha), adicionar:

```js
function gerarSenhaTemp() {
  const letras = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz';
  const numeros = '23456789';
  let senha = '';
  for (let i = 0; i < 6; i++) senha += letras[Math.floor(Math.random() * letras.length)];
  for (let i = 0; i < 4; i++) senha += numeros[Math.floor(Math.random() * numeros.length)];
  return senha;
}

const dialogNovoCliente = document.getElementById('dialog-novo-cliente');
const formNovoCliente = document.getElementById('form-novo-cliente');
const inputNcNome = document.getElementById('nc-nome');
const inputNcEmail = document.getElementById('nc-email');
const inputNcTelefone = document.getElementById('nc-telefone');
const inputNcSenha = document.getElementById('nc-senha');

document.getElementById('btn-novo-cliente').addEventListener('click', () => {
  formNovoCliente.reset();
  inputNcSenha.value = gerarSenhaTemp();
  dialogNovoCliente.showModal();
});

document.getElementById('btn-nc-cancel').addEventListener('click', () => dialogNovoCliente.close());

document.getElementById('btn-nc-copiar-senha').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(inputNcSenha.value);
    toast('Senha copiada.', 'success');
  } catch {
    toast('Não foi possível copiar. Copie manualmente.', 'error');
  }
});

formNovoCliente.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const btnConfirm = document.getElementById('btn-nc-confirm');
  btnConfirm.disabled = true;
  btnConfirm.textContent = 'Cadastrando...';

  try {
    const { user } = await api.post('/api/auth/registro', {
      nome: inputNcNome.value.trim(),
      email: inputNcEmail.value.trim(),
      senha: inputNcSenha.value,
      telefone: inputNcTelefone.value.trim(),
    });
    dialogNovoCliente.close();
    toast(`${user.nome} cadastrado! Agora escolha o plano.`, 'success');
    await abrirDialogMatricula(user.id, user.nome, '');
  } catch (err) {
    toast(err.message || 'Erro ao cadastrar cliente.', 'error');
  } finally {
    btnConfirm.disabled = false;
    btnConfirm.textContent = 'Cadastrar e matricular';
  }
});
```

- [ ] **Step 4: Verificar manualmente**

Com o servidor local rodando (backend + `npx serve frontend`), abrir `http://localhost:3000/admin/alunos.html` logado como dono ou admin:
1. Clicar em "Novo Cliente" → o dialog abre com uma senha já preenchida no campo (readonly).
2. Preencher nome + e-mail (usar um e-mail que não exista ainda na base) → clicar "Cadastrar e matricular".
3. Confirmar toast de sucesso, o dialog de matrícula abrir na sequência com o nome certo no título, escolher um plano e confirmar.
4. Confirmar que o novo aluno aparece na tabela com o plano escolhido.
5. Repetir o cadastro com o mesmo e-mail → confirmar que aparece um erro (`Registro duplicado`) em vez de travar a tela.
6. Logar como `professor` (ou simular removendo `data-role-adminup` via devtools) e confirmar que o botão "Novo Cliente" fica escondido.

- [ ] **Step 5: Commit**

```bash
git add frontend/admin/alunos.html frontend/assets/js/admin-alunos.js
git commit -m "feat(admin): fluxo de cadastro de Novo Cliente em Alunos (reaproveita /api/auth/registro)"
```

---

## Task 5: QA final da Fase 1

**Files:** nenhum arquivo novo — só verificação manual cruzando o checklist "Teste" do spec (`docs/superpowers/specs/2026-07-19-admin-menu-cloudgym-design.md`).

**Interfaces:** nenhuma — task de verificação, não produz interface pra ninguém.

- [ ] **Step 1: Rodar o checklist completo com os três papéis**

Com backend + `npx serve frontend` rodando, logar como `dono`, depois como `admin`, depois como `professor` (criar/usar um usuário de cada papel se necessário) e, pra cada um, abrir todas as 19 páginas do admin (`index.html`, `alunos.html`, `ponto-de-venda.html`, `aulas.html`, `exercicios.html`, `treinos.html`, `automation-flow.html`, `monitor-treino.html`, `ranking.html`, `frequencia.html`, `planos.html`, `marketing-digital.html`, `crm.html`, `financeiro.html`, `pagamentos.html`, `relatorio.html`, `equipe.html`, `configuracoes.html`, `suporte.html`), confirmando:

- O item ativo certo aparece destacado em cada página.
- `dono` vê todos os itens; `admin` não vê Financeiro/Relatório/Equipe; `professor` só vê os itens sem `data-role-*` (Ranking, Frequência, Suporte, e os 4 filhos de Ficha de Treino).
- O submenu "Ficha de Treino" abre/fecha ao clicar e já vem aberto quando a página atual é uma das filhas.
- Nenhuma página gera erro no console do navegador.

- [ ] **Step 2: Registrar o resultado**

Se tudo passar, não é necessário nenhum commit adicional (é só verificação). Se algo falhar, voltar pro task correspondente, corrigir, e repetir o Step 1 antes de considerar a Fase 1 concluída.
