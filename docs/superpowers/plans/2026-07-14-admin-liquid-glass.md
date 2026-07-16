# Admin Liquid Glass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Levar o material "liquid glass" (blur + fundo com gradiente estático) e a paleta oficial da marca TEG pro painel admin (12 páginas), sem editar nenhuma das páginas HTML nem nenhum arquivo JS.

**Architecture:** Toda a mudança fica em `frontend/assets/css/admin.css`. Como as 12 páginas do admin já usam as mesmas classes compartilhadas (`.card`, `.table-wrap`, `.sidebar`, `.kanban-col`), restilizar essas classes uma vez cobre o painel inteiro. As cores de marca são redefinidas como variáveis CSS locais em `.app-shell` (não em `:root`), então gráficos/badges/botões do admin recolorem automaticamente (eles já leem `var(--color-primary)` etc.) sem tocar em `.js`, e o resto do site (login, landing, dashboard do aluno) não é afetado.

**Tech Stack:** CSS puro (custom properties, `backdrop-filter`, `-webkit-mask-image`), sem framework, sem build step.

## Global Constraints

- Não editar nenhum arquivo `.html` em `frontend/admin/` — todas as classes já existem no DOM.
- Não editar nenhum arquivo `.js` — cores de gráfico/badge resolvem via `var(--color-*)`.
- Não alterar `:root` em `global.css` — a correção de paleta fica local a `.app-shell`, só afeta páginas admin.
- Scrim de modal (`.admin-dialog::backdrop`, `.modal-overlay`) continua escuro sólido, não vira vidro.
- Elementos pequenos que precisam de contraste sólido (`.donut-hole`, `.avatar-fallback`, `.exercicio-thumb`) não recebem vidro.
- `.table-wrap` precisa manter `overflow-x: auto` (scroll horizontal em tabelas largas) — não usar `overflow: hidden` nela.

---

### Task 1: Fundo com gradiente + paleta oficial da marca

**Files:**
- Modify: `frontend/assets/css/admin.css` (adicionar no final do arquivo)

**Interfaces:**
- Produces: variáveis `--color-primary`, `--color-primary-hover`, `--color-wine`, `--color-coral` redefinidas dentro do seletor `.app-shell` — consumidas por todo o resto do plano (sidebar, cards, gráficos, badges) automaticamente via herança de CSS custom property, sem precisar repetir a redefinição em cada task.

- [ ] **Step 1: Adicionar o bloco de fundo e paleta**

No final de `frontend/assets/css/admin.css`, adicionar:

```css

/* ===== Liquid glass — paleta oficial da marca, escopada só no admin =====
   Redefine as variáveis de marca localmente em .app-shell (não em :root),
   então tudo que já lê var(--color-primary)/var(--color-wine)/var(--color-coral)
   — gráficos, donut, badges, botões, .sidebar-nav a.active via
   --gradient-flame — recolore automaticamente sem tocar em nenhum .js, e
   sem afetar páginas fora do admin (login, landing, dashboard do aluno). */
.app-shell {
  position: relative;
  --color-primary: #FF7A1A;
  --color-primary-hover: #e56a10;
  --color-wine: #7A1B1E;
  --color-coral: #B62929;
}
/* Fundo estático (sem WebGL/animação) — mesma técnica usada no dashboard
   do aluno (.dash-shell::before), dá textura pro blur dos cards sem custo
   de performance/risco de compat. */
.app-shell::before {
  content: '';
  position: fixed;
  inset: 0;
  z-index: -1;
  background:
    radial-gradient(ellipse 700px 500px at 85% 0%, rgba(255,122,26,0.14), transparent 65%),
    linear-gradient(135deg, rgba(122,27,30,0.16) 0%, rgba(182,41,41,0.12) 50%, rgba(255,122,26,0.10) 100%),
    var(--color-bg);
  pointer-events: none;
}
:root[data-theme="light"] .app-shell::before {
  background:
    radial-gradient(ellipse 700px 500px at 85% 0%, rgba(255,122,26,0.08), transparent 65%),
    linear-gradient(135deg, rgba(122,27,30,0.08) 0%, rgba(182,41,41,0.06) 50%, rgba(255,122,26,0.05) 100%),
    var(--color-bg);
}
```

- [ ] **Step 2: Verificação sintática**

Run (Git Bash):
```bash
node -e "
const css = require('fs').readFileSync('frontend/assets/css/admin.css', 'utf8');
const open = (css.match(/\{/g) || []).length;
const close = (css.match(/\}/g) || []).length;
console.log('open:', open, 'close:', close, open === close ? 'OK balanceado' : 'DESBALANCEADO');
"
```
Expected: `OK balanceado`

- [ ] **Step 3: Commit**

```bash
git add frontend/assets/css/admin.css
git commit -m "feat(admin): fundo com gradiente e paleta oficial da marca, escopados em .app-shell"
```

---

### Task 2: Sidebar e cards em vidro

**Files:**
- Modify: `frontend/assets/css/admin.css` (adicionar no final do arquivo)

**Interfaces:**
- Consumes: fundo/paleta da Task 1 (o `.app-shell::before` precisa estar atrás pra o blur ter o que desfocar).
- Produces: `.app-shell .sidebar` e `.app-shell .card` com vidro — cobre `stat-card`, cards de gráfico/donut/metas/transações, cards de configurações, e `.card.modal-box` (usado em `pagamentos.html`, já coberto automaticamente por ser `.card`).

- [ ] **Step 1: Adicionar o vidro na sidebar e nos cards**

No final de `frontend/assets/css/admin.css`, adicionar:

```css

/* ===== Sidebar em vidro ===== */
.app-shell .sidebar {
  background: linear-gradient(160deg, rgba(255,255,255,0.055), rgba(255,255,255,0.012) 55%);
  backdrop-filter: blur(20px) saturate(150%);
  -webkit-backdrop-filter: blur(20px) saturate(150%);
  border-right: 1px solid rgba(255,255,255,0.08);
}
:root[data-theme="light"] .app-shell .sidebar {
  background: linear-gradient(160deg, rgba(255,255,255,0.6), rgba(255,255,255,0.28) 55%);
  border-right: 1px solid rgba(255,255,255,0.5);
}

/* ===== Cards em vidro (stat cards, gráficos, listas, configurações) =====
   Cobre .card.modal-box (pagamentos.html) automaticamente — não precisa
   de regra separada pro modal, ele já tem a classe .card. */
.app-shell .card {
  position: relative;
  overflow: hidden;
  background: linear-gradient(160deg, rgba(255,255,255,0.06), rgba(255,255,255,0.015) 55%);
  backdrop-filter: blur(22px) saturate(160%);
  -webkit-backdrop-filter: blur(22px) saturate(160%);
  border: 1px solid rgba(255,255,255,0.09);
  box-shadow:
    inset 0 1px 1px rgba(255,255,255,0.14),
    inset 0 -8px 18px rgba(0,0,0,0.25),
    0 10px 26px rgba(0,0,0,0.4);
  -webkit-mask-image: -webkit-radial-gradient(white, black);
}
.app-shell .card::after {
  content: '';
  position: absolute;
  left: -15%; bottom: -30%;
  width: 65%; height: 65%;
  background: radial-gradient(ellipse at center, rgba(255,255,255,0.14), rgba(255,255,255,0) 65%);
  filter: blur(6px);
  mix-blend-mode: screen;
  pointer-events: none;
}
:root[data-theme="light"] .app-shell .card {
  background: linear-gradient(160deg, rgba(255,255,255,0.62), rgba(255,255,255,0.3) 55%);
  border: 1px solid rgba(255,255,255,0.55);
  box-shadow:
    inset 0 1px 1px rgba(255,255,255,0.7),
    inset 0 -8px 18px rgba(20,18,15,0.04),
    0 10px 26px rgba(20,18,15,0.08);
}
:root[data-theme="light"] .app-shell .card::after {
  background: radial-gradient(ellipse at center, rgba(255,255,255,0.55), rgba(255,255,255,0) 65%);
}
```

> Nota: `.donut-hole`, `.avatar-fallback` e `.exercicio-thumb` não são `.card` — não são afetados por essa regra, então continuam com fundo sólido automaticamente, sem precisar de nenhuma regra extra pra "proteger" a legibilidade deles.

- [ ] **Step 2: Verificação sintática**

Run:
```bash
node -e "
const css = require('fs').readFileSync('frontend/assets/css/admin.css', 'utf8');
const open = (css.match(/\{/g) || []).length;
const close = (css.match(/\}/g) || []).length;
console.log('open:', open, 'close:', close, open === close ? 'OK balanceado' : 'DESBALANCEADO');
"
```
Expected: `OK balanceado`

- [ ] **Step 3: Commit**

```bash
git add frontend/assets/css/admin.css
git commit -m "feat(admin): sidebar e cards em vidro"
```

---

### Task 3: Tabelas em vidro

**Files:**
- Modify: `frontend/assets/css/admin.css` (adicionar no final do arquivo)

**Interfaces:**
- Consumes: fundo/paleta da Task 1.
- Produces: `.app-shell .table-wrap` com vidro, usado em 7 páginas (Alunos, Aulas, Equipe, Planos, Pagamentos, Ranking, Frequência).

- [ ] **Step 1: Adicionar o vidro no wrapper das tabelas**

No final de `frontend/assets/css/admin.css`, adicionar:

```css

/* ===== Tabelas em vidro ===== */
.app-shell .table-wrap {
  position: relative;
  overflow-x: auto;
  overflow-y: hidden;
  background: linear-gradient(160deg, rgba(255,255,255,0.05), rgba(255,255,255,0.012) 55%);
  backdrop-filter: blur(18px) saturate(150%);
  -webkit-backdrop-filter: blur(18px) saturate(150%);
  border: 1px solid rgba(255,255,255,0.09);
}
:root[data-theme="light"] .app-shell .table-wrap {
  background: linear-gradient(160deg, rgba(255,255,255,0.6), rgba(255,255,255,0.28) 55%);
  border: 1px solid rgba(255,255,255,0.5);
}
```

> Nota: `overflow-x: auto` é mantido (não `overflow: hidden`) pra não quebrar o scroll horizontal em tabelas largas — o requisito original do `.table-wrap` em `global.css`.

- [ ] **Step 2: Verificação sintática**

Run:
```bash
node -e "
const css = require('fs').readFileSync('frontend/assets/css/admin.css', 'utf8');
const open = (css.match(/\{/g) || []).length;
const close = (css.match(/\}/g) || []).length;
console.log('open:', open, 'close:', close, open === close ? 'OK balanceado' : 'DESBALANCEADO');
"
```
Expected: `OK balanceado`

- [ ] **Step 3: Commit**

```bash
git add frontend/assets/css/admin.css
git commit -m "feat(admin): tabelas em vidro"
```

---

### Task 4: Kanban do CRM em vidro

**Files:**
- Modify: `frontend/assets/css/admin.css` (adicionar no final do arquivo)

**Interfaces:**
- Consumes: fundo/paleta da Task 1.
- Produces: `.kanban-col` e `.kanban-card` com vidro. `.kanban-card` fica com opacidade mais alta (menos transparente) que os outros elementos de vidro — precisa de bom contraste durante o arraste, já que fica em cima de duas camadas de vidro (coluna + fundo).

- [ ] **Step 1: Adicionar o vidro no Kanban**

No final de `frontend/assets/css/admin.css`, adicionar:

```css

/* ===== Kanban do CRM em vidro =====
   .kanban-card fica menos transparente que os outros elementos de vidro —
   ele empilha em cima da coluna (que já é vidro) e precisa de bom
   contraste de texto durante o arraste. */
.kanban-col {
  background: linear-gradient(160deg, rgba(255,255,255,0.05), rgba(255,255,255,0.012) 55%);
  backdrop-filter: blur(18px) saturate(150%);
  -webkit-backdrop-filter: blur(18px) saturate(150%);
  border: 1px solid rgba(255,255,255,0.09);
}
.kanban-card {
  background: linear-gradient(160deg, rgba(255,255,255,0.09), rgba(255,255,255,0.025) 55%);
  backdrop-filter: blur(14px) saturate(150%);
  -webkit-backdrop-filter: blur(14px) saturate(150%);
  border: 1px solid rgba(255,255,255,0.11);
}
:root[data-theme="light"] .kanban-col {
  background: linear-gradient(160deg, rgba(255,255,255,0.6), rgba(255,255,255,0.28) 55%);
  border: 1px solid rgba(255,255,255,0.5);
}
:root[data-theme="light"] .kanban-card {
  background: linear-gradient(160deg, rgba(255,255,255,0.78), rgba(255,255,255,0.45) 55%);
  border: 1px solid rgba(255,255,255,0.6);
}
```

- [ ] **Step 2: Verificação sintática**

Run:
```bash
node -e "
const css = require('fs').readFileSync('frontend/assets/css/admin.css', 'utf8');
const open = (css.match(/\{/g) || []).length;
const close = (css.match(/\}/g) || []).length;
console.log('open:', open, 'close:', close, open === close ? 'OK balanceado' : 'DESBALANCEADO');
"
```
Expected: `OK balanceado`

- [ ] **Step 3: Commit**

```bash
git add frontend/assets/css/admin.css
git commit -m "feat(admin): kanban do CRM em vidro"
```

---

### Task 5: Modal (`<dialog class="admin-dialog">`) em vidro

**Files:**
- Modify: `frontend/assets/css/admin.css:301-309` (a regra `.admin-dialog` existente)

**Interfaces:**
- Consumes: fundo/paleta da Task 1.
- Produces: `.admin-dialog` com vidro. `.admin-dialog::backdrop` (o scrim atrás do modal) **não muda** — continua escuro sólido.

- [ ] **Step 1: Substituir o background sólido do `.admin-dialog` por vidro**

Em `frontend/assets/css/admin.css`, a regra `.admin-dialog` (por volta da linha 301) hoje é:

```css
.admin-dialog {
  width: 100%; max-width: 400px;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-lg);
  background: linear-gradient(180deg, #131313, var(--color-surface));
  color: var(--color-text);
  padding: 2rem;
  box-shadow: 0 0 0 1px rgba(255,255,255,.03), 0 24px 64px rgba(0,0,0,0.5);
}
```

Trocar por:

```css
.admin-dialog {
  position: relative;
  overflow: hidden;
  width: 100%; max-width: 400px;
  border: 1px solid rgba(255,255,255,0.09);
  border-radius: var(--radius-lg);
  background: linear-gradient(160deg, rgba(255,255,255,0.06), rgba(255,255,255,0.015) 55%);
  backdrop-filter: blur(22px) saturate(160%);
  -webkit-backdrop-filter: blur(22px) saturate(160%);
  color: var(--color-text);
  padding: 2rem;
  box-shadow:
    inset 0 1px 1px rgba(255,255,255,0.14),
    inset 0 -8px 18px rgba(0,0,0,0.25),
    0 24px 64px rgba(0,0,0,0.5);
  -webkit-mask-image: -webkit-radial-gradient(white, black);
}
.admin-dialog::after {
  content: '';
  position: absolute;
  left: -15%; bottom: -30%;
  width: 65%; height: 65%;
  background: radial-gradient(ellipse at center, rgba(255,255,255,0.14), rgba(255,255,255,0) 65%);
  filter: blur(6px);
  mix-blend-mode: screen;
  pointer-events: none;
}
```

> Nota: mantido sem variante de tema claro — o `.admin-dialog` original já era escuro fixo (`#131313`) independente do tema, então a versão em vidro também fica assim, sem mudar esse comportamento.

- [ ] **Step 2: Verificação sintática**

Run:
```bash
node -e "
const css = require('fs').readFileSync('frontend/assets/css/admin.css', 'utf8');
const open = (css.match(/\{/g) || []).length;
const close = (css.match(/\}/g) || []).length;
console.log('open:', open, 'close:', close, open === close ? 'OK balanceado' : 'DESBALANCEADO');
"
```
Expected: `OK balanceado`

- [ ] **Step 3: Commit**

```bash
git add frontend/assets/css/admin.css
git commit -m "feat(admin): modal (admin-dialog) em vidro"
```

---

### Task 6: Verificação final no navegador (todas as páginas) + push

**Files:** nenhum (só verificação manual)

**Interfaces:**
- Consumes: Tasks 1-5 completas.

- [ ] **Step 1: Subir os servidores de verificação**

Terminal 1 (backend, schema isolado de teste):
```bash
cd backend
export NODE_ENV=test
node run-migrations.js
node -e "
process.env.NODE_ENV = 'test';
const app = require('./src/server.js');
app.listen(3001, () => console.log('Servidor de verificação rodando em http://localhost:3001'));
"
```

Terminal 2 (frontend estático, a partir da raiz do repo):
```bash
node -e "
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = 'frontend';
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
http.createServer((req, res) => {
  let filePath = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (filePath.endsWith('/')) filePath = path.join(filePath, 'index.html');
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found: ' + filePath); return; }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}).listen(5500, () => console.log('Frontend estático em http://localhost:5500'));
"
```

- [ ] **Step 2: Criar um usuário admin/dono de teste e logar**

Run (Git Bash), pra ter um usuário com role `dono` (o role com mais acesso, vê todas as páginas):
```bash
curl -s -X POST http://localhost:3001/api/auth/registro -H "Content-Type: application/json" \
  -d '{"nome":"Dono Verificacao Glass","email":"dono-glass@teste.com","senha":"senha1234","telefone":"67977776666"}'
```
Guardar o `token` retornado. Depois, promover esse usuário pra `dono` diretamente no banco (schema de teste), já que o registro público sempre cria como `aluno`:
```bash
node -e "
process.env.NODE_ENV = 'test';
const pool = require('./backend/src/config/db.js');
pool.query(\"UPDATE usuarios SET role = 'dono' WHERE email = 'dono-glass@teste.com'\")
  .then(() => { console.log('OK, promovido a dono'); return pool.end(); });
"
```

No navegador, abrir `http://localhost:5500/admin/index.html`, colar o token no `localStorage` (`localStorage.setItem('token', '<token>')`) e recarregar.

- [ ] **Step 3: Conferir visualmente cada página, tema escuro**

Navegar por: `admin/index.html` (Dashboard — stat cards + gráfico), `admin/financeiro.html` (donut + linha + metas + transações), `admin/alunos.html` (tabela + modal), `admin/crm.html` (Kanban), `admin/configuracoes.html` (cards de settings, sem gráfico/tabela).

Confirmar em cada uma:
- Sidebar com vidro, sem quebrar a navegação
- Cards/tabelas/kanban com vidro, fundo com gradiente vermelho→laranja visível atrás
- Cores de gráfico/donut/badge na paleta oficial (vermelho→laranja, não mais laranja+vinho+coral misturado)
- Sem erro no console (`list_console_messages` ou equivalente)
- Abrir um modal (ex: "Novo aluno" em `alunos.html`) e confirmar que o vidro renderiza bem, sem cortar texto nem quebrar o formulário

- [ ] **Step 4: Conferir tema claro**

No console do navegador: `window.tegToggleTheme('light')` (ou o botão de tema na sidebar). Repetir a checagem visual do Step 3 nas mesmas páginas.

- [ ] **Step 5: Encerrar os servidores de verificação**

Parar os dois processos de terminal (Ctrl+C ou matar o processo em background).

- [ ] **Step 6: Sincronizar com origin e publicar**

```bash
git fetch origin
git status
```
Se `origin/master` tiver avançado, fazer `git merge origin/master` (resolvendo conflito se houver — improvável, já que só `admin.css` foi tocado neste plano) antes de:
```bash
git push
```
