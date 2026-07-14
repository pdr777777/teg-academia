# Dashboard Liquid Glass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesenhar `frontend/dashboard.html` com sidebar e painéis em "liquid glass" (estilo Apple), cores da TEG, painel de configurações escopado ao que o backend suporta, e ícones consistentes no estilo coolicons aplicados no site inteiro.

**Architecture:** Frontend puro (HTML/CSS/JS vanilla, sem build step) seguindo os padrões já existentes no repo (`api.js`, `ui.js`, `app-effects.js`, `icons.js` via `data-icon`). Um novo arquivo `liquid-glass.css` concentra o material de vidro reutilizável; `dashboard.css` é reescrito para o novo layout. Backend ganha uma coluna nova (`notificacoes_whatsapp`) e o gate correspondente nos jobs de WhatsApp — tudo seguindo os padrões de migration/rota/teste já usados no projeto (Express + pg + Jest/supertest).

**Tech Stack:** Node/Express, PostgreSQL (migrations SQL puras), Jest + supertest, HTML/CSS/JS vanilla sem framework.

## Global Constraints

- Sem dependências novas (nem CDN, nem npm) — tudo em SVG inline via `icons.js` e CSS puro.
- Sidebar liquid glass só em `dashboard.html` por enquanto — as outras páginas continuam com o topnav atual.
- Sem emoji em nenhuma parte da UI — usar sempre `Icons.icon()` / `data-icon`.
- Backend: seguir os padrões de teste existentes (`criarUsuario`/`criarPlano`/`criarMatricula`/`criarAula`/`gerarToken` de `src/testUtils/fixtures.js`, supertest contra `src/server.js`).
- Rodar `cd backend && export NODE_ENV=test && npx jest <arquivo>` (Git Bash) após cada tarefa de backend.

---

### Task 1: Migration — coluna `notificacoes_whatsapp`

**Files:**
- Create: `database/migrations/025_notificacoes_whatsapp.sql`

**Interfaces:**
- Produces: coluna `usuarios.notificacoes_whatsapp BOOLEAN NOT NULL DEFAULT TRUE`, consumida pelas Tasks 2 e 3.

- [ ] **Step 1: Criar a migration**

```sql
ALTER TABLE usuarios
  ADD COLUMN notificacoes_whatsapp BOOLEAN NOT NULL DEFAULT TRUE;
```

- [ ] **Step 2: Aplicar no schema de teste**

Run (Git Bash, a partir de `backend/`):
```bash
cd backend && export NODE_ENV=test && node run-migrations.js
```
Expected: linha `Aplicando 025_notificacoes_whatsapp.sql... OK` seguida de `Migrations em dia.`

- [ ] **Step 3: Commit**

```bash
git add database/migrations/025_notificacoes_whatsapp.sql
git commit -m "feat(db): adiciona notificacoes_whatsapp em usuarios"
```

---

### Task 2: Fixtures de teste — suportar `notificacoes_whatsapp`

**Files:**
- Modify: `backend/src/testUtils/fixtures.js:10-25`

**Interfaces:**
- Consumes: coluna da Task 1.
- Produces: `criarUsuario({ notificacoes_whatsapp: false })` cria um usuário com a preferência desativada; usado pelas Tasks 3 e 4.

- [ ] **Step 1: Editar `criarUsuario`**

Substituir o corpo da função (linhas 10-25) por:

```js
async function criarUsuario(overrides = {}) {
  const senha_hash = await bcrypt.hash('senha1234', 4);
  const { rows: [user] } = await pool.query(
    `INSERT INTO usuarios (nome, email, senha_hash, telefone, role, link_indicacao, notificacoes_whatsapp)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [
      overrides.nome || 'Aluno Teste',
      overrides.email || `${unico()}@teste.com`,
      senha_hash,
      overrides.telefone || '67999999999',
      overrides.role || 'aluno',
      overrides.link_indicacao || unico().slice(0, 8),
      overrides.notificacoes_whatsapp ?? true,
    ]
  );
  return user;
}
```

- [ ] **Step 2: Rodar a suíte de auth (usa criarUsuario pesadamente) pra confirmar que nada quebrou**

Run:
```bash
cd backend && export NODE_ENV=test && npx jest src/routes/auth.test.js
```
Expected: todos os testes existentes continuam passando (PASS).

- [ ] **Step 3: Commit**

```bash
git add backend/src/testUtils/fixtures.js
git commit -m "test: fixtures suportam override de notificacoes_whatsapp"
```

---

### Task 3: API — expor `notificacoes_whatsapp` em GET/PATCH `/api/alunos/perfil`

**Files:**
- Modify: `backend/src/routes/alunos.js:51-92`
- Test: `backend/src/routes/alunos.test.js`

**Interfaces:**
- Consumes: coluna da Task 1, `criarUsuario` da Task 2.
- Produces: `GET /api/alunos/perfil` retorna `notificacoes_whatsapp` (boolean); `PATCH /api/alunos/perfil` aceita `notificacoes_whatsapp` no body — consumido pela Task 10 (drawer de configurações no frontend).

- [ ] **Step 1: Escrever os testes (falhando)**

Adicionar ao final de `backend/src/routes/alunos.test.js` (antes do último `});` de fechamento do arquivo, como novo `describe`):

```js
describe('notificacoes_whatsapp — preferência de notificação', () => {
  afterAll(async () => {
    await pool.end();
  });

  test('GET /perfil retorna notificacoes_whatsapp (true por padrão)', async () => {
    const aluno = await criarUsuario();

    const res = await request(app)
      .get('/api/alunos/perfil')
      .set('Authorization', `Bearer ${gerarToken(aluno)}`);

    expect(res.status).toBe(200);
    expect(res.body.notificacoes_whatsapp).toBe(true);

    await pool.query('DELETE FROM usuarios WHERE id = $1', [aluno.id]);
  });

  test('PATCH /perfil desativa notificacoes_whatsapp', async () => {
    const aluno = await criarUsuario();

    const res = await request(app)
      .patch('/api/alunos/perfil')
      .set('Authorization', `Bearer ${gerarToken(aluno)}`)
      .send({ notificacoes_whatsapp: false });

    expect(res.status).toBe(200);
    expect(res.body.notificacoes_whatsapp).toBe(false);

    const { rows: [user] } = await pool.query(
      'SELECT notificacoes_whatsapp FROM usuarios WHERE id = $1', [aluno.id]
    );
    expect(user.notificacoes_whatsapp).toBe(false);

    await pool.query('DELETE FROM usuarios WHERE id = $1', [aluno.id]);
  });
});
```

> Nota: o `describe` existente (`GET /api/alunos/dashboard e /perfil`) tinha seu próprio `afterAll(() => pool.end())`. Chamar `pool.end()` duas vezes no mesmo processo de teste FALHA ("Called end on pool more than once") — mova esse `afterAll` pra fora de qualquer `describe`, no final do arquivo, como um único `afterAll` de nível de módulo cobrindo todos os testes do arquivo.

- [ ] **Step 2: Rodar e confirmar que falha**

Run:
```bash
cd backend && export NODE_ENV=test && npx jest src/routes/alunos.test.js -t "notificacoes_whatsapp"
```
Expected: FAIL — `expect(res.body.notificacoes_whatsapp).toBe(true)` recebe `undefined`.

- [ ] **Step 3: Implementar — GET /perfil**

Em `backend/src/routes/alunos.js`, na rota `GET /perfil` (linha 51-68), trocar o SELECT:

```js
router.get('/perfil', authMiddleware, async (req, res, next) => {
  try {
    const { rows: [user] } = await pool.query(
      `SELECT u.id, u.nome, u.email, u.telefone, u.cpf, u.data_nascimento, u.foto_url, u.notificacoes_whatsapp,
              m.status as matricula_status, m.data_vencimento, p.nome as plano_nome
       FROM usuarios u
       LEFT JOIN LATERAL (
         SELECT * FROM matriculas WHERE usuario_id = u.id ORDER BY created_at DESC LIMIT 1
       ) m ON true
       LEFT JOIN planos p ON p.id = m.plano_id
       WHERE u.id = $1`,
      [req.user.id]
    );
    res.json(user);
  } catch (err) {
    next(err);
  }
});
```

- [ ] **Step 4: Implementar — PATCH /perfil**

Trocar a rota `PATCH /perfil` (linha 70-92) por:

```js
router.patch('/perfil', authMiddleware, async (req, res, next) => {
  try {
    const CAMPOS_PERMITIDOS = ['nome', 'telefone', 'foto_url', 'data_nascimento', 'notificacoes_whatsapp'];
    const updates = [];
    const values = [];
    for (const campo of CAMPOS_PERMITIDOS) {
      if (req.body[campo] !== undefined) {
        updates.push(`${campo} = $${values.push(req.body[campo])}`);
      }
    }
    if (!updates.length) return res.status(400).json({ error: 'Nenhum campo válido enviado' });

    values.push(req.user.id);
    const { rows: [user] } = await pool.query(
      `UPDATE usuarios SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${values.length} RETURNING id, nome, email, telefone, foto_url, notificacoes_whatsapp`,
      values
    );
    res.json(user);
  } catch (err) {
    next(err);
  }
});
```

- [ ] **Step 5: Rodar e confirmar que passa**

Run:
```bash
cd backend && export NODE_ENV=test && npx jest src/routes/alunos.test.js
```
Expected: todos os testes do arquivo em PASS, incluindo os dois novos.

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/alunos.js backend/src/routes/alunos.test.js
git commit -m "feat(api): expõe notificacoes_whatsapp em GET/PATCH /alunos/perfil"
```

---

### Task 4: JobWorker — não enviar WhatsApp pra quem desativou a preferência

**Files:**
- Modify: `backend/src/jobs/jobWorker.js`
- Test: `backend/src/jobs/jobWorker.test.js`

**Interfaces:**
- Consumes: coluna da Task 1, `criarUsuario` da Task 2.
- Produces: nenhuma interface nova — comportamento interno do worker.

- [ ] **Step 1: Escrever os testes (falhando)**

Adicionar dentro do `describe('agendarAutomacoes — lembrete de atraso', ...)` existente em `backend/src/jobs/jobWorker.test.js` (depois do teste `'agenda job whatsapp_atraso pra matrícula vencida e não duplica no mesmo dia'`, antes do `});` de fechamento do describe):

```js
  test('não agenda whatsapp_atraso quando o aluno desativou notificacoes_whatsapp', async () => {
    const user = await criarUsuario({ notificacoes_whatsapp: false });
    const plano = await criarPlano();
    const matricula = await criarMatricula({
      usuario_id: user.id, plano_id: plano.id, status: 'vencida',
      data_vencimento: new Date(Date.now() - 1 * 86400000),
    });

    await pool.query(`DELETE FROM jobs WHERE tipo = 'whatsapp_atraso' AND payload->>'telefone' = $1`, [user.telefone]);
    await pool.query(`DELETE FROM automacoes_log WHERE usuario_id = $1 AND tipo = 'atraso'`, [user.id]);

    await agendarAutomacoes();

    const { rows: jobs } = await pool.query(
      `SELECT * FROM jobs WHERE tipo = 'whatsapp_atraso' AND payload->>'telefone' = $1`,
      [user.telefone]
    );
    expect(jobs).toHaveLength(0);

    await pool.query(`DELETE FROM automacoes_log WHERE usuario_id = $1`, [user.id]);
    await pool.query('DELETE FROM matriculas WHERE id = $1', [matricula.id]);
    await pool.query('DELETE FROM usuarios WHERE id = $1', [user.id]);
  });
```

Adicionar dentro do `describe('processarVencimentos', ...)` existente (depois do último teste do describe, antes do `});` de fechamento):

```js
  test('gera cobrança mesmo com notificacoes_whatsapp desativado, mas não agenda o aviso por WhatsApp', async () => {
    // Telefone único: o padrão '67999999999' da fixture é compartilhado por quase
    // todo teste do arquivo, e jobs 'whatsapp_cobranca_gerada' de execuções
    // anteriores não são limpos — filtrar só por tipo+telefone pegaria lixo de
    // outros testes/execuções e o assert de "não agenda job" falharia por
    // contaminação cruzada, não pela ausência real do gate.
    const user = await criarUsuario({ notificacoes_whatsapp: false, telefone: `679${Date.now()}`.slice(0, 11) });
    const plano = await criarPlano({ preco_mensal: 109.9, duracao_dias: 30 });
    const matricula = await criarMatricula({
      usuario_id: user.id, plano_id: plano.id, status: 'ativa', data_vencimento: new Date(),
    });

    await processarVencimentos();

    const { rows: pagamentos } = await pool.query(
      'SELECT * FROM pagamentos WHERE matricula_id = $1', [matricula.id]
    );
    expect(pagamentos).toHaveLength(1);

    const { rows: jobs } = await pool.query(
      `SELECT * FROM jobs WHERE tipo = 'whatsapp_cobranca_gerada' AND payload->>'telefone' = $1`,
      [user.telefone]
    );
    expect(jobs).toHaveLength(0);

    await limpar({ usuarios: [user.id], planos: [plano.id], matriculas: [matricula.id] });
  });
```

- [ ] **Step 2: Rodar e confirmar que falham**

Run:
```bash
cd backend && export NODE_ENV=test && npx jest src/jobs/jobWorker.test.js -t "notificacoes_whatsapp"
```
Expected: FAIL nos dois novos testes (jobs ainda são criados, porque o gate não existe).

- [ ] **Step 3: Implementar o gate nas 5 queries de `agendarAutomacoes`**

Em `backend/src/jobs/jobWorker.js`, editar as 5 queries dentro de `agendarAutomacoes()`:

Ausentes (linha ~25-33) — trocar `WHERE u.role = 'aluno' AND u.ativo = TRUE` por:
```sql
    WHERE u.role = 'aluno' AND u.ativo = TRUE AND u.notificacoes_whatsapp = TRUE
```

Vencendo (linha ~58-64) — trocar:
```sql
    WHERE m.status = 'ativa'
      AND m.data_vencimento BETWEEN NOW() AND NOW() + INTERVAL '3 days'
```
por:
```sql
    WHERE m.status = 'ativa'
      AND m.data_vencimento BETWEEN NOW() AND NOW() + INTERVAL '3 days'
      AND u.notificacoes_whatsapp = TRUE
```

Reativação (linha ~85-89) — trocar:
```sql
    WHERE m.status = 'vencida' AND m.data_vencimento <= CURRENT_DATE - INTERVAL '15 days'
```
por:
```sql
    WHERE m.status = 'vencida' AND m.data_vencimento <= CURRENT_DATE - INTERVAL '15 days'
      AND u.notificacoes_whatsapp = TRUE
```

Atrasados (linha ~109-114) — trocar:
```sql
    WHERE m.status IN ('vencida', 'suspensa') AND m.data_vencimento::date < CURRENT_DATE
```
por:
```sql
    WHERE m.status IN ('vencida', 'suspensa') AND m.data_vencimento::date < CURRENT_DATE
      AND u.notificacoes_whatsapp = TRUE
```

Aniversariantes (linha ~135-140) — trocar:
```sql
    WHERE u.ativo = TRUE
      AND EXTRACT(MONTH FROM u.data_nascimento) = EXTRACT(MONTH FROM NOW())
      AND EXTRACT(DAY FROM u.data_nascimento) = EXTRACT(DAY FROM NOW())
```
por:
```sql
    WHERE u.ativo = TRUE AND u.notificacoes_whatsapp = TRUE
      AND EXTRACT(MONTH FROM u.data_nascimento) = EXTRACT(MONTH FROM NOW())
      AND EXTRACT(DAY FROM u.data_nascimento) = EXTRACT(DAY FROM NOW())
```

- [ ] **Step 4: Implementar o gate em `processarVencimentos` (sem pular a cobrança)**

A cobrança (`pagamentos`) tem que ser gerada de qualquer jeito — só o aviso por WhatsApp é opcional. Em `processarVencimentos()`, trocar o SELECT de `vencendoHoje` (linha ~169-179):

```js
  const { rows: vencendoHoje } = await pool.query(`
    SELECT m.id AS matricula_id, m.usuario_id, m.data_vencimento, p.preco_mensal, p.duracao_dias,
           u.telefone, u.nome, u.notificacoes_whatsapp
    FROM matriculas m
    JOIN planos p ON p.id = m.plano_id
    JOIN usuarios u ON u.id = m.usuario_id
    WHERE m.status = 'ativa' AND m.data_vencimento::date <= CURRENT_DATE
      AND NOT EXISTS (
        SELECT 1 FROM pagamentos
        WHERE matricula_id = m.id AND gerado_automaticamente = TRUE AND created_at::date >= m.data_vencimento::date
      )
  `);
```

E dentro do loop `for (const m of vencendoHoje)` (linha ~198-201), trocar:

```js
      await pool.query(
        `INSERT INTO jobs (tipo, payload, agendado_para) VALUES ($1, $2, NOW())`,
        ['whatsapp_cobranca_gerada', JSON.stringify({ telefone: m.telefone, nome: m.nome, link_pagamento })]
      );
```
por:
```js
      if (m.notificacoes_whatsapp) {
        await pool.query(
          `INSERT INTO jobs (tipo, payload, agendado_para) VALUES ($1, $2, NOW())`,
          ['whatsapp_cobranca_gerada', JSON.stringify({ telefone: m.telefone, nome: m.nome, link_pagamento })]
        );
      }
```

- [ ] **Step 5: Rodar e confirmar que os novos testes passam**

Run:
```bash
cd backend && export NODE_ENV=test && npx jest src/jobs/jobWorker.test.js
```
Expected: todos os testes do arquivo em PASS.

- [ ] **Step 6: Rodar a suíte completa do backend (regressão)**

Run:
```bash
cd backend && export NODE_ENV=test && npx jest --runInBand --forceExit
```
Expected: todas as suítes em PASS (mesmo total de antes + 4 testes novos).

- [ ] **Step 7: Commit**

```bash
git add backend/src/jobs/jobWorker.js backend/src/jobs/jobWorker.test.js
git commit -m "fix(jobs): respeita notificacoes_whatsapp antes de enviar lembretes"
```

---

### Task 5: Ícones — peso visual coolicons + 3 ícones novos

**Files:**
- Modify: `frontend/assets/js/icons.js`

**Interfaces:**
- Produces: `Icons.icon('settings'|'shield'|'bell', opts)` — consumido pela Task 9 (markup do dashboard).

- [ ] **Step 1: Ajustar a espessura do traço**

Em `frontend/assets/js/icons.js`, trocar a linha 1-2 (comentário) por:

```js
// Biblioteca de ícones SVG inline — sem emojis, sem dependência externa.
// Estilo consistente: stroke 1.9, linhas arredondadas, viewBox 0 0 24 24 (peso inspirado no coolicons).
```

E na função `icon()` (linha 71-76), trocar `stroke-width="1.75"` por `stroke-width="1.9"`:

```js
function icon(name, opts = {}) {
  const { size = 24, className = '' } = opts;
  const inner = ICONS[name];
  if (!inner) return '';
  return `<svg class="icon${className ? ' ' + className : ''}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${inner}</svg>`;
}
```

- [ ] **Step 2: Adicionar os 3 ícones novos**

No objeto `ICONS`, logo antes da linha final `};` (depois de `'clipboard-list': ...`), adicionar:

```js
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
```

- [ ] **Step 3: Verificação manual**

Não há suíte de testes de frontend neste projeto (só o backend usa Jest). Abrir qualquer página existente (ex.: `frontend/login.html`) direto no navegador e confirmar visualmente que os ícones já usados no site (menu, home, dumbbell etc.) continuam nítidos e um pouco mais "encorpados" que antes — nenhum ícone deve sumir ou ficar quebrado.

- [ ] **Step 4: Commit**

```bash
git add frontend/assets/js/icons.js
git commit -m "feat(ui): ajusta peso dos ícones e adiciona settings/shield/bell"
```

---

### Task 6: Tema — suporte a "Automático" (segue o sistema)

**Files:**
- Modify: `frontend/assets/js/theme.js`

**Interfaces:**
- Produces: `window.tegSetThemePref(pref)` onde `pref` é `'auto'|'light'|'dark'`; botões com `data-theme-option="auto|light|dark"` ficam com classe `.active` no correto — consumido pela Task 9 (seção Aparência do drawer).
- Mantém: `window.tegToggleTheme()`, `window.tegTheme`, `[data-theme-toggle]`, `[data-theme-switch]` — comportamento antigo intacto pras outras páginas.

- [ ] **Step 1: Reescrever o arquivo**

Substituir todo o conteúdo de `frontend/assets/js/theme.js` por:

```js
// Tema claro/escuro/automático — aplica cedo (evita flash) e expõe um toggle global.
(function () {
  const STORAGE_KEY = 'teg-theme';
  const media = window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)') : null;

  function getSavedPref() {
    try {
      return localStorage.getItem(STORAGE_KEY);
    } catch {
      return null;
    }
  }

  function resolve(pref) {
    if (pref === 'auto') return media && media.matches ? 'light' : 'dark';
    return pref === 'light' ? 'light' : 'dark';
  }

  function apply(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    document.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
      btn.setAttribute('data-icon', theme === 'light' ? 'moon' : 'sun');
      btn.setAttribute('aria-pressed', theme === 'light' ? 'true' : 'false');
      btn.title = theme === 'light' ? 'Mudar para tema escuro' : 'Mudar para tema claro';
    });
    document.querySelectorAll('[data-theme-switch]').forEach((input) => {
      input.checked = theme === 'light';
    });
    document.querySelectorAll('[data-theme-option]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.themeOption === window.tegThemePref);
    });
  }

  window.tegThemePref = getSavedPref() || 'dark';
  window.tegTheme = resolve(window.tegThemePref);
  apply(window.tegTheme);

  window.tegSetThemePref = function (pref) {
    window.tegThemePref = pref;
    try {
      localStorage.setItem(STORAGE_KEY, pref);
    } catch {
      /* localStorage indisponível — tema não persiste, mas segue funcionando */
    }
    window.tegTheme = resolve(pref);
    apply(window.tegTheme);
    if (window.Icons && typeof window.fillIcons === 'function') {
      document.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
        btn.removeAttribute('data-icon-done');
      });
      window.fillIcons();
    }
  };

  window.tegToggleTheme = function (forced) {
    const next = forced || (window.tegTheme === 'light' ? 'dark' : 'light');
    window.tegSetThemePref(next);
  };

  if (media && media.addEventListener) {
    media.addEventListener('change', () => {
      if (window.tegThemePref === 'auto') {
        window.tegTheme = resolve('auto');
        apply(window.tegTheme);
      }
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    apply(window.tegTheme);
    document.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
      btn.addEventListener('click', () => window.tegToggleTheme());
    });
    document.querySelectorAll('[data-theme-switch]').forEach((input) => {
      input.checked = window.tegTheme === 'light';
      input.addEventListener('change', (ev) => {
        window.tegSetThemePref(ev.target.checked ? 'light' : 'dark');
      });
    });
    document.querySelectorAll('[data-theme-option]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.themeOption === window.tegThemePref);
      btn.addEventListener('click', () => window.tegSetThemePref(btn.dataset.themeOption));
    });
  });
})();
```

- [ ] **Step 2: Verificação manual**

Abrir `frontend/login.html` (ou qualquer página existente) no navegador — o botão de tema no topnav (`data-theme-toggle`) continua alternando claro/escuro normalmente, sem erros no console. O comportamento padrão (sem preferência salva) continua escuro, igual antes.

- [ ] **Step 3: Commit**

```bash
git add frontend/assets/js/theme.js
git commit -m "feat(ui): tema automático (segue o sistema) via tegSetThemePref"
```

---

### Task 7: `liquid-glass.css` — material de vidro reutilizável

**Files:**
- Create: `frontend/assets/css/liquid-glass.css`

**Interfaces:**
- Produces: classe `.glass` (+ variante `.glass.active-nav`) reutilizável — consumida pela Task 9 (markup do dashboard).

- [ ] **Step 1: Criar o arquivo**

```css
/* ===== Liquid glass — material reutilizável (squircle + brilho especular) ===== */
.glass {
  position: relative;
  border-radius: 24px;
  overflow: hidden;
  background: linear-gradient(160deg, rgba(255,255,255,0.055), rgba(255,255,255,0.012) 55%);
  backdrop-filter: blur(20px) saturate(150%);
  -webkit-backdrop-filter: blur(20px) saturate(150%);
  box-shadow:
    inset 0 1px 1px rgba(255,255,255,0.16),
    inset 0 -10px 20px rgba(0,0,0,0.3),
    0 10px 30px rgba(0,0,0,0.45);
  border: 1px solid rgba(255,255,255,0.08);
}
.glass::after {
  content: '';
  position: absolute;
  left: -15%; bottom: -35%;
  width: 70%; height: 70%;
  background: radial-gradient(ellipse at center, rgba(255,255,255,0.16), rgba(255,255,255,0) 65%);
  filter: blur(6px);
  mix-blend-mode: screen;
  pointer-events: none;
}
.glass::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, rgba(255,138,0,0.09), rgba(122,31,63,0.10) 65%, transparent);
  mix-blend-mode: overlay;
  pointer-events: none;
}
.glass.active-nav {
  background: linear-gradient(150deg, rgba(255,138,0,0.22), rgba(122,31,63,0.14));
  border-color: rgba(255,138,0,0.22);
  box-shadow: inset 0 1px 1px rgba(255,255,255,0.2), 0 6px 20px rgba(255,138,0,0.15);
}

/* ===== Tema claro — vidro fica mais claro/branco, mantém o brilho ===== */
:root[data-theme="light"] .glass {
  background: linear-gradient(160deg, rgba(255,255,255,0.65), rgba(255,255,255,0.32) 55%);
  border: 1px solid rgba(255,255,255,0.5);
  box-shadow:
    inset 0 1px 1px rgba(255,255,255,0.7),
    inset 0 -10px 20px rgba(20,18,15,0.04),
    0 10px 30px rgba(20,18,15,0.08);
}
:root[data-theme="light"] .glass::after {
  background: radial-gradient(ellipse at center, rgba(255,255,255,0.6), rgba(255,255,255,0) 65%);
}
:root[data-theme="light"] .glass.active-nav {
  background: linear-gradient(150deg, rgba(255,138,0,0.28), rgba(122,31,63,0.16));
}
```

- [ ] **Step 2: Verificação manual**

Ainda não há markup usando `.glass` (isso vem na Task 9) — este passo só garante que o CSS é sintaticamente válido. Abrir o arquivo num linter/editor e confirmar que não há chaves desbalanceadas (o editor não deve mostrar erro de sintaxe CSS).

- [ ] **Step 3: Commit**

```bash
git add frontend/assets/css/liquid-glass.css
git commit -m "feat(ui): sistema de material liquid glass reutilizável"
```

---

### Task 8: `dashboard.css` — layout do novo dashboard

**Files:**
- Modify: `frontend/assets/css/dashboard.css` (reescrita completa — o arquivo atual é 100% específico do layout antigo que está sendo substituído)

**Interfaces:**
- Consumes: `.glass` da Task 7.
- Produces: todas as classes de layout consumidas pelo markup da Task 9 (`.dash-shell`, `.sidebar`, `.sb-*`, `.stats-row`, `.ring`, `.activity`, `.bars`, `.lower-row`, `.hoje`, `.next-aula`, `.right-col`, `.profile`, `.calendar-card`, `.schedule-card`, `.config-*`, `.drawer-*`, `.toggle-glass`, `.theme-opt`).

- [ ] **Step 1: Substituir todo o conteúdo do arquivo**

```css
/* ===== Shell (sidebar + main + coluna direita) ===== */
.dash-shell {
  display: grid;
  grid-template-columns: 232px 1fr 280px;
  gap: 1rem;
  align-items: start;
  padding: 1.5rem;
  max-width: 1440px;
  margin: 0 auto;
}

.sidebar {
  position: sticky;
  top: 1.5rem;
  padding: 1.25rem 0.85rem;
  display: flex;
  flex-direction: column;
  gap: 1.4rem;
  min-height: calc(100vh - 3rem);
}
.sb-logo {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  padding: 0 0.4rem;
  font-family: var(--font-display);
  font-size: 1rem;
  letter-spacing: 0.03em;
}
.sb-logo-img { width: 22px; height: 22px; }
.sb-nav { display: flex; flex-direction: column; gap: 0.3rem; }
.sb-item {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  padding: 0.65rem 0.75rem;
  border-radius: 14px;
  color: var(--color-muted);
  font-size: 0.86rem;
  font-weight: 600;
  transition: color 0.15s;
}
.sb-item:hover { color: var(--color-text); }
.sb-item.active-nav { color: var(--color-text); }
.sb-foot { margin-top: auto; display: flex; flex-direction: column; gap: 0.3rem; }
.sb-foot .sb-item { background: none; border: none; cursor: pointer; width: 100%; text-align: left; font-family: var(--font); }

.sidebar-toggle {
  display: none;
  position: fixed;
  top: 1rem; left: 1rem;
  z-index: 40;
  width: 42px; height: 42px;
  align-items: center; justify-content: center;
  color: var(--color-text);
}
.sidebar-scrim {
  display: none;
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.5);
  z-index: 29;
}

.dash-main { display: flex; flex-direction: column; gap: 1rem; }

.greet { padding: 1.1rem 1.4rem; display: flex; justify-content: space-between; align-items: center; }
.greet h1 { font-size: 1.3rem; margin-top: 0.15rem; }
.chip {
  font-size: 0.7rem;
  padding: 0.35rem 0.8rem;
  border-radius: 999px;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.1);
  color: var(--color-muted);
  white-space: nowrap;
}
:root[data-theme="light"] .chip { background: rgba(20,18,15,0.04); border-color: rgba(20,18,15,0.08); }

/* ===== Stats row ===== */
.stats-row { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.85rem; }
.stat-glass {
  padding: 1rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  text-align: center;
}
.ring {
  width: 54px; height: 54px;
  border-radius: 50%;
  background: conic-gradient(var(--color-primary) calc(var(--pct, 0) * 1%), rgba(255,255,255,0.08) 0);
  display: flex; align-items: center; justify-content: center;
}
.ring-inner {
  width: 40px; height: 40px;
  border-radius: 50%;
  background: var(--color-bg);
  display: flex; align-items: center; justify-content: center;
}
.ring-inner strong { font-size: 0.68rem; font-weight: 700; }
.heartline { width: 100%; height: 38px; }
.heartline polyline { fill: none; stroke: var(--color-coral); stroke-width: 2; }
.stat-big { font-size: 1.35rem; font-weight: 800; letter-spacing: -0.02em; }
.stat-lbl { font-size: 0.66rem; color: var(--color-muted); }

/* ===== Activity ===== */
.activity { padding: 1.1rem 1.3rem; }
.activity-head { margin-bottom: 0.9rem; }
.activity-head h2 { font-size: 0.95rem; }
.bars { display: flex; align-items: flex-end; gap: 0.6rem; height: 90px; }
.bar-col { display: flex; flex-direction: column; align-items: center; gap: 0.4rem; flex: 1; }
.bar {
  width: 100%; height: 22%;
  border-radius: 8px 8px 4px 4px;
  background: rgba(255,255,255,0.07);
  transition: height 0.4s ease;
}
.bar.on {
  height: 100%;
  background: linear-gradient(180deg, var(--color-primary), var(--color-coral));
  box-shadow: 0 0 12px rgba(255,138,0,0.3);
}
.bar.hoje { box-shadow: inset 0 0 0 1px rgba(255,255,255,0.35); }
.bar-col span { font-size: 0.63rem; color: var(--color-muted); }

/* ===== Lower row ===== */
.lower-row { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0.85rem; }
.section-label { font-size: 0.66rem; text-transform: uppercase; letter-spacing: 0.09em; color: var(--color-muted); margin-bottom: 0.4rem; }

.conquistas { padding: 1rem 1.15rem; }
.conquista-item { display: flex; align-items: center; gap: 0.65rem; font-size: 0.78rem; padding: 0.4rem 0; }
.conquista-item .icon-badge {
  width: 30px; height: 30px; border-radius: 50%;
  background: var(--color-primary-soft);
  color: var(--color-primary);
  border: 1px solid rgba(255,138,0,0.2);
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
}
.conquista-item strong { display: block; font-size: 0.82rem; }
.conquista-item span { color: var(--color-muted); font-size: 0.7rem; }

.hoje {
  padding: 1rem;
  display: flex; flex-direction: column; align-items: center; gap: 0.4rem;
  justify-content: center; text-align: center;
}
.btn-checkin-glass {
  margin-top: 0.4rem;
  padding: 0.6rem 1.2rem;
  border-radius: 999px;
  background: linear-gradient(135deg, var(--color-primary), var(--color-coral));
  color: #fff;
  font-size: 0.78rem;
  font-weight: 700;
  display: flex; align-items: center; gap: 0.4rem;
  transition: filter 0.15s, transform 0.1s;
}
.btn-checkin-glass:hover:not(:disabled) { filter: brightness(1.08); transform: translateY(-1px); }
.btn-checkin-glass:disabled { opacity: 0.6; cursor: default; }

.next-aula { padding: 1rem 1.15rem; display: flex; justify-content: space-between; align-items: center; gap: 0.6rem; }
.next-aula-nome { font-weight: 700; font-size: 0.85rem; margin-top: 0.15rem; }

/* ===== Coluna direita ===== */
.right-col { display: flex; flex-direction: column; gap: 1rem; position: sticky; top: 1.5rem; }
.profile { padding: 1.2rem; display: flex; flex-direction: column; align-items: center; gap: 0.4rem; text-align: center; }
.profile strong { font-size: 0.88rem; }
.chips { display: flex; gap: 0.4rem; margin-top: 0.4rem; flex-wrap: wrap; justify-content: center; }

.calendar-card { padding: 1rem; }
.calendario-grid { display: grid; grid-template-columns: repeat(7, 1fr); gap: 0.3rem; margin-top: 0.6rem; }
.cal-dia {
  aspect-ratio: 1;
  border-radius: 7px;
  background: rgba(255,255,255,0.04);
  display: flex; align-items: center; justify-content: center;
  font-size: 0.66rem;
  color: var(--color-muted);
}
.cal-dia.treinou {
  background: rgba(255,138,0,0.22);
  color: var(--color-text);
  font-weight: 700;
}
.cal-dia.hoje:not(.treinou) { box-shadow: inset 0 0 0 1px rgba(255,138,0,0.45); }
.cal-dia.vazio { visibility: hidden; }

.schedule-card { padding: 1rem; }
.agenda-item { display: flex; align-items: center; gap: 0.5rem; font-size: 0.74rem; padding: 0.35rem 0; color: var(--color-text); }
.agenda-dot { width: 7px; height: 7px; border-radius: 50%; background: var(--color-primary); flex-shrink: 0; }

/* ===== Painel de configurações ===== */
.config-overlay {
  display: none;
  position: fixed; inset: 0;
  background: rgba(0,0,0,0.5);
  z-index: 50;
  align-items: center; justify-content: center;
  padding: 1.5rem;
}
.config-overlay.open { display: flex; }
.config-drawer { width: 100%; max-width: 640px; max-height: 80vh; display: flex; flex-direction: column; }
.drawer-head { display: flex; align-items: center; justify-content: space-between; padding: 1.1rem 1.4rem; border-bottom: 1px solid rgba(255,255,255,0.08); }
.drawer-head h2 { font-size: 1.05rem; }
.drawer-head button { color: var(--color-muted); }
.drawer-body { display: grid; grid-template-columns: 160px 1fr; gap: 0; overflow: hidden; flex: 1; margin-top: 0.9rem; }
.drawer-nav { padding: 0.4rem 0.7rem 1rem; display: flex; flex-direction: column; gap: 0.2rem; border-right: 1px solid rgba(255,255,255,0.06); overflow-y: auto; }
.drawer-nav-item {
  display: flex; align-items: center; gap: 0.55rem;
  padding: 0.55rem 0.6rem; border-radius: 12px;
  font-size: 0.8rem; color: var(--color-muted); text-align: left;
}
.drawer-nav-item.active { color: var(--color-text); background: rgba(255,138,0,0.14); }
.drawer-content { padding: 0.5rem 1.4rem 1.4rem; overflow-y: auto; }
.drawer-section { display: none; }
.drawer-section.active { display: block; }
.setting-row {
  display: flex; justify-content: space-between; align-items: center;
  padding: 0.8rem 0; border-bottom: 1px solid rgba(255,255,255,0.06);
}
.setting-row:last-child { border-bottom: none; }
.setting-t { font-size: 0.85rem; }
.setting-d { font-size: 0.72rem; color: var(--color-muted); margin-top: 0.15rem; }

.toggle-glass {
  width: 42px; height: 25px; border-radius: 999px;
  background: rgba(255,255,255,0.12);
  position: relative; flex-shrink: 0;
  transition: background-color 0.2s;
}
.toggle-glass::after {
  content: '';
  position: absolute; top: 3px; left: 3px;
  width: 19px; height: 19px; border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 3px rgba(0,0,0,0.4);
  transition: left 0.2s;
}
.toggle-glass.on { background: linear-gradient(135deg, var(--color-primary), var(--color-coral)); }
.toggle-glass.on::after { left: 20px; }

.theme-options { display: flex; gap: 0.4rem; margin-top: 0.6rem; }
.theme-opt {
  padding: 0.45rem 0.9rem; border-radius: 999px;
  font-size: 0.76rem; color: var(--color-muted);
  background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08);
}
.theme-opt.active { color: #fff; background: linear-gradient(135deg, var(--color-primary), var(--color-coral)); border-color: transparent; }

/* ===== Responsivo ===== */
@media (max-width: 1180px) {
  .dash-shell { grid-template-columns: 220px 1fr; }
  .right-col { grid-column: 1 / -1; flex-direction: row; position: static; overflow-x: auto; }
  .right-col > * { flex: 1; min-width: 240px; }
}
@media (max-width: 900px) {
  .dash-shell { grid-template-columns: 1fr; padding: 1rem; padding-top: 4.5rem; }
  .sidebar {
    position: fixed; top: 0; left: 0; bottom: 0;
    width: 240px; min-height: 100vh;
    border-radius: 0 24px 24px 0;
    transform: translateX(-100%);
    transition: transform 0.25s ease;
    z-index: 30;
  }
  .sidebar.open { transform: translateX(0); }
  .sidebar-toggle { display: flex; }
  .sidebar-scrim.open { display: block; }
  .stats-row { grid-template-columns: repeat(2, 1fr); }
  .lower-row { grid-template-columns: 1fr; }
  .right-col { flex-direction: column; }
  .right-col > * { min-width: 0; }
  .drawer-body { grid-template-columns: 1fr; }
  .drawer-nav { flex-direction: row; flex-wrap: wrap; border-right: none; border-bottom: 1px solid rgba(255,255,255,0.06); }
}
```

- [ ] **Step 2: Verificação manual**

Confirmar sintaticamente que o arquivo não tem chaves desbalanceadas (o markup real só chega na Task 9, então visualmente ainda não há o que testar no navegador).

- [ ] **Step 3: Commit**

```bash
git add frontend/assets/css/dashboard.css
git commit -m "feat(ui): layout do novo dashboard (sidebar, stats, drawer de config)"
```

---

### Task 9: `dashboard.html` — novo markup

**Files:**
- Modify: `frontend/dashboard.html` (reescrita completa do `<head>` e `<body>`)

**Interfaces:**
- Consumes: `.glass`/`liquid-glass.css` (Task 7), classes de `dashboard.css` (Task 8), ícones `settings`/`shield`/`bell` (Task 5), `data-theme-option` (Task 6).
- Produces: todos os elementos com `id` consumidos pela Task 10 (`dashboard.js`).

- [ ] **Step 1: Substituir todo o conteúdo do arquivo**

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Minha Área — Academia TEG</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
  <link rel="icon" type="image/png" href="assets/img/favicon.png" />
  <link rel="stylesheet" href="assets/css/global.css" />
  <link rel="stylesheet" href="assets/css/aluno.css" />
  <link rel="stylesheet" href="assets/css/liquid-glass.css" />
  <link rel="stylesheet" href="assets/css/dashboard.css" />
  <link rel="stylesheet" href="assets/css/app-effects.css" />
  <script src="assets/js/theme.js"></script>
</head>
<body>

  <div class="dash-shell">
    <aside class="glass sidebar" id="sidebar">
      <a href="dashboard.html" class="sb-logo">
        <img src="assets/img/logo.svg" alt="" class="sb-logo-img" onerror="this.style.display='none'" />
        <span>TEG ACADEMIA</span>
      </a>
      <nav class="sb-nav">
        <a href="dashboard.html" class="glass active-nav sb-item active-nav"><span data-icon="grid" data-icon-size="16"></span>Dashboard</a>
        <a href="treinos.html" class="sb-item"><span data-icon="dumbbell" data-icon-size="16"></span>Treinos</a>
        <a href="ranking.html" class="sb-item"><span data-icon="award" data-icon-size="16"></span>Ranking</a>
        <a href="indicacao.html" class="sb-item"><span data-icon="link" data-icon-size="16"></span>Indicação</a>
        <a href="perfil.html" class="sb-item"><span data-icon="user" data-icon-size="16"></span>Perfil</a>
      </nav>
      <div class="sb-foot">
        <button type="button" class="sb-item" id="btn-open-config"><span data-icon="settings" data-icon-size="16"></span>Configurações</button>
        <button type="button" class="sb-item" id="btn-logout"><span data-icon="log-out" data-icon-size="16"></span>Sair</button>
      </div>
    </aside>

    <button type="button" class="glass sidebar-toggle" id="btn-sidebar-toggle" data-icon="menu" data-icon-size="18" aria-label="Abrir menu" aria-expanded="false"></button>
    <div class="sidebar-scrim" id="sidebar-scrim"></div>

    <main class="dash-main aluno-main">
      <div id="bloqueio-banner"></div>

      <div class="glass greet">
        <div>
          <p class="text-muted" id="saudacao">Carregando...</p>
          <h1 id="dash-nome">—</h1>
        </div>
        <span class="chip" id="dash-plano-badge"></span>
      </div>

      <div class="stats-row">
        <div class="glass stat-glass">
          <div class="ring" id="ring-sequencia"><div class="ring-inner"><strong id="dash-sequencia">0</strong></div></div>
          <span class="stat-lbl">Sequência (dias)</span>
        </div>
        <div class="glass stat-glass">
          <svg class="heartline" id="freq-sparkline" viewBox="0 0 100 30" preserveAspectRatio="none"><polyline points="" /></svg>
          <span class="stat-lbl">Frequência da semana</span>
        </div>
        <div class="glass stat-glass">
          <strong class="stat-big" id="stat-total-treinos">0</strong>
          <span class="stat-lbl">Treinos no total</span>
        </div>
        <div class="glass stat-glass">
          <div class="ring" id="ring-xp"><div class="ring-inner"><strong id="dash-nivel">Nv.1</strong></div></div>
          <span class="stat-lbl" id="dash-xp-next">0 XP até o próximo nível</span>
        </div>
      </div>

      <section class="glass activity">
        <div class="activity-head">
          <h2>Frequência da semana</h2>
        </div>
        <div class="bars" id="bars-semana"></div>
      </section>

      <div class="lower-row">
        <section class="glass conquistas">
          <div class="section-label">Conquistas recentes</div>
          <div id="lista-conquistas" class="stack gap-md"></div>
        </section>

        <section class="glass hoje">
          <span data-icon="flame" data-icon-size="26" class="text-primary"></span>
          <div class="section-label">Hoje</div>
          <p class="text-muted" id="hoje-status">Carregando...</p>
          <button id="btn-checkin" class="btn-checkin-glass">
            <span data-icon="check-circle" data-icon-size="16"></span>Registrar treino
          </button>
        </section>

        <section class="glass next-aula" id="next-aula">
          <div>
            <div class="section-label">Próxima aula</div>
            <div class="next-aula-nome" id="next-aula-nome">—</div>
          </div>
          <span class="chip" id="next-aula-prof"></span>
        </section>
      </div>
    </main>

    <aside class="right-col">
      <div class="glass profile">
        <span class="avatar-fallback" id="profile-avatar">—</span>
        <strong id="profile-nome">—</strong>
        <span class="text-muted" id="profile-email">—</span>
        <div class="chips">
          <span class="chip" id="profile-plano"></span>
          <span class="chip" id="profile-vencimento"></span>
        </div>
      </div>

      <div class="glass calendar-card">
        <div class="row-between">
          <div class="section-label" id="calendar-mes">—</div>
          <span data-icon="calendar" data-icon-size="16" class="text-muted"></span>
        </div>
        <div class="calendario-grid" id="calendario-grid"></div>
      </div>

      <div class="glass schedule-card">
        <div class="section-label">Aulas da semana</div>
        <div id="lista-agenda" class="stack gap-sm"></div>
      </div>
    </aside>
  </div>

  <div class="config-overlay" id="config-overlay">
    <div class="glass config-drawer" id="config-drawer">
      <div class="drawer-head">
        <h2>Configurações</h2>
        <button type="button" id="btn-close-config" data-icon="x" data-icon-size="18" aria-label="Fechar"></button>
      </div>
      <div class="drawer-body">
        <nav class="drawer-nav">
          <button type="button" class="drawer-nav-item active" data-section="conta"><span data-icon="user" data-icon-size="15"></span>Conta</button>
          <button type="button" class="drawer-nav-item" data-section="seguranca"><span data-icon="shield" data-icon-size="15"></span>Segurança</button>
          <button type="button" class="drawer-nav-item" data-section="notificacoes"><span data-icon="bell" data-icon-size="15"></span>Notificações</button>
          <button type="button" class="drawer-nav-item" data-section="aparencia"><span data-icon="sun" data-icon-size="15"></span>Aparência</button>
          <button type="button" class="drawer-nav-item" data-section="ajuda"><span data-icon="phone" data-icon-size="15"></span>Ajuda</button>
        </nav>
        <div class="drawer-content">
          <div class="drawer-section active" data-section-panel="conta">
            <div class="setting-row">
              <div><div class="setting-t">Nome</div><div class="setting-d" id="config-conta-nome">—</div></div>
            </div>
            <div class="setting-row">
              <div><div class="setting-t">E-mail</div><div class="setting-d" id="config-conta-email">—</div></div>
            </div>
            <div class="setting-row">
              <div><div class="setting-t">Telefone</div><div class="setting-d" id="config-conta-telefone">—</div></div>
            </div>
            <a href="perfil.html" class="btn btn-ghost btn-sm">Editar dados no Perfil<span data-icon="chevron-right" data-icon-size="14"></span></a>
          </div>

          <form class="drawer-section" data-section-panel="seguranca" id="form-senha">
            <div class="field">
              <label for="config-senha-atual">Senha atual</label>
              <input type="password" id="config-senha-atual" required autocomplete="current-password" />
            </div>
            <div class="field">
              <label for="config-senha-nova">Nova senha</label>
              <input type="password" id="config-senha-nova" required autocomplete="new-password" minlength="8" />
            </div>
            <button type="submit" class="btn btn-primary btn-sm" id="btn-senha-salvar">Trocar senha</button>
          </form>

          <div class="drawer-section" data-section-panel="notificacoes">
            <div class="setting-row">
              <div><div class="setting-t">Lembretes por WhatsApp</div><div class="setting-d">Avisos de vencimento, ausência e cobrança</div></div>
              <button type="button" class="toggle-glass" id="toggle-whatsapp" role="switch" aria-checked="false"></button>
            </div>
          </div>

          <div class="drawer-section" data-section-panel="aparencia">
            <div class="setting-row" style="flex-direction:column;align-items:flex-start">
              <div class="setting-t">Tema</div>
              <div class="theme-options">
                <button type="button" class="theme-opt" data-theme-option="light">Claro</button>
                <button type="button" class="theme-opt" data-theme-option="dark">Escuro</button>
                <button type="button" class="theme-opt" data-theme-option="auto">Automático</button>
              </div>
            </div>
          </div>

          <div class="drawer-section" data-section-panel="ajuda">
            <a href="https://wa.me/5567999999999" target="_blank" rel="noopener" class="btn btn-ghost btn-sm">Falar com o suporte<span data-icon="chevron-right" data-icon-size="14"></span></a>
          </div>
        </div>
      </div>
    </div>
  </div>

  <script src="assets/js/icons.js"></script>
  <script src="assets/js/api.js"></script>
  <script src="assets/js/ui.js"></script>
  <script src="assets/js/app-effects.js"></script>
  <script src="assets/js/auth-guard.js"></script>
  <script src="assets/js/dashboard.js"></script>
</body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add frontend/dashboard.html
git commit -m "feat(ui): novo markup do dashboard (sidebar, painéis, drawer de config)"
```

---

### Task 10: `dashboard.js` — dados reais + interações novas

**Files:**
- Modify: `frontend/assets/js/dashboard.js` (reescrita completa)

**Interfaces:**
- Consumes: `api.get/patch/post`, `toast`, `formatData`, `iniciais`, `animateNumber`, `renderBloqueioBanner`, `setBtnLoading`/`resetBtnLoading` (todos já globais via scripts carregados antes), `GET /api/alunos/dashboard`, `GET /api/alunos/perfil`, `PATCH /api/alunos/perfil`, `PATCH /api/auth/senha`, `GET /api/frequencias/minha?mes=`, `POST /api/frequencias/checkin`, `GET /api/aulas` (Task 3 adicionou `notificacoes_whatsapp` no perfil).
- Produces: nenhuma interface nova (é a última peça — só consome).

- [ ] **Step 1: Substituir todo o conteúdo do arquivo**

```js
document.getElementById('btn-logout').addEventListener('click', logout);

const XP_LEVELS = [0, 500, 1200, 2500, 5000, 9000, 15000];
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const DIAS_ABREV = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function calcXpLevel(xp) {
  let level = 1;
  for (let i = 0; i < XP_LEVELS.length; i++) {
    if (xp >= XP_LEVELS[i]) level = i + 1;
    else break;
  }
  const cur = XP_LEVELS[level - 1] || 0;
  const next = XP_LEVELS[level] || cur * 2;
  const pct = Math.min(((xp - cur) / (next - cur)) * 100, 100);
  return { level, pct, remaining: next - xp };
}

function saudacaoHora() {
  const h = new Date().getHours();
  if (h < 12) return 'Bom dia';
  if (h < 18) return 'Boa tarde';
  return 'Boa noite';
}

async function carregarDashboard() {
  try {
    const d = await api.get('/api/alunos/dashboard');

    document.getElementById('saudacao').textContent = `${saudacaoHora()},`;
    document.getElementById('dash-nome').textContent = d.nome;
    document.getElementById('dash-sequencia').textContent = d.sequencia_atual;

    const lvl = calcXpLevel(d.xp);
    document.getElementById('dash-nivel').textContent = `Nv.${lvl.level}`;
    document.getElementById('dash-xp-next').textContent = `${lvl.remaining.toLocaleString('pt-BR')} XP até o próximo nível`;

    const pctSequencia = Math.min((d.sequencia_atual / Math.max(d.maior_sequencia, d.sequencia_atual, 7)) * 100, 100);
    document.getElementById('ring-sequencia').style.setProperty('--pct', pctSequencia);
    document.getElementById('ring-xp').style.setProperty('--pct', lvl.pct);

    const planoBadge = document.getElementById('dash-plano-badge');
    planoBadge.textContent = d.plano_nome
      ? `Plano ${d.plano_nome} — ${d.matricula_status === 'ativa' ? 'ativo' : d.matricula_status}`
      : 'Sem plano ativo';

    renderBloqueioBanner('bloqueio-banner', d);

    animateNumber(document.getElementById('stat-total-treinos'), d.total_treinos);

    document.getElementById('profile-avatar').textContent = iniciais(d.nome);
    document.getElementById('profile-nome').textContent = d.nome;
    document.getElementById('profile-email').textContent = d.email;
    document.getElementById('profile-plano').textContent = d.plano_nome ? `Plano ${d.plano_nome}` : 'Sem plano';
    document.getElementById('profile-vencimento').textContent = d.data_vencimento ? `Vence ${formatData(d.data_vencimento)}` : '';

    const lista = document.getElementById('lista-conquistas');
    lista.innerHTML = d.conquistas_recentes.length
      ? d.conquistas_recentes.map((c) => `
          <div class="conquista-item">
            <span class="icon-badge">${Icons.icon('award', { size: 18 })}</span>
            <div><strong>${c.nome}</strong><span>${formatData(c.desbloqueada_em)}</span></div>
          </div>
        `).join('')
      : '<div class="empty-state">Nenhuma conquista ainda — treine para desbloquear!</div>';
  } catch (err) {
    toast(err.message || 'Erro ao carregar seus dados.', 'error');
  }
}

async function carregarCalendario() {
  const grid = document.getElementById('calendario-grid');
  const agora = new Date();
  const mes = `${agora.getFullYear()}-${String(agora.getMonth() + 1).padStart(2, '0')}`;
  document.getElementById('calendar-mes').textContent = `${MESES[agora.getMonth()]} ${agora.getFullYear()}`;

  try {
    const frequencias = await api.get(`/api/frequencias/minha?mes=${mes}`);
    const diasTreinados = new Set(frequencias.map((f) => new Date(f.data).getUTCDate()));

    const totalDias = new Date(agora.getFullYear(), agora.getMonth() + 1, 0).getDate();
    const primeiroDiaSemana = new Date(agora.getFullYear(), agora.getMonth(), 1).getDay();

    const diaHoje = agora.getDate();
    let html = '';
    for (let i = 0; i < primeiroDiaSemana; i++) html += '<div class="cal-dia vazio"></div>';
    for (let dia = 1; dia <= totalDias; dia++) {
      const classes = ['cal-dia'];
      if (diasTreinados.has(dia)) classes.push('treinou');
      if (dia === diaHoje) classes.push('hoje');
      html += `<div class="${classes.join(' ')}">${dia}</div>`;
    }
    grid.innerHTML = html;

    document.getElementById('hoje-status').textContent = diasTreinados.has(diaHoje)
      ? 'Treino registrado hoje!'
      : 'Ainda não treinou hoje';
  } catch (err) {
    grid.innerHTML = '<div class="empty-state">Não foi possível carregar a frequência.</div>';
  }
}

function inicioDaSemana(data) {
  const d = new Date(data);
  const diaSemana = d.getDay();
  const offset = diaSemana === 0 ? -6 : 1 - diaSemana;
  d.setDate(d.getDate() + offset);
  d.setHours(0, 0, 0, 0);
  return d;
}

async function carregarFrequenciaSemana() {
  const hoje = new Date();
  const segunda = inicioDaSemana(hoje);
  const diasSemana = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(segunda);
    d.setDate(d.getDate() + i);
    return d;
  });

  const meses = [...new Set(diasSemana.map((d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`))];

  let treinados = new Set();
  try {
    const resultados = await Promise.all(meses.map((mes) => api.get(`/api/frequencias/minha?mes=${mes}`)));
    treinados = new Set(resultados.flat().map((f) => new Date(f.data).toISOString().slice(0, 10)));
  } catch (err) {
    // segue com o set vazio — as barras aparecem todas "não treinou"
  }

  const chaveHoje = hoje.toISOString().slice(0, 10);
  const LABELS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];

  const bars = document.getElementById('bars-semana');
  bars.innerHTML = diasSemana.map((d, i) => {
    const chave = d.toISOString().slice(0, 10);
    const classes = ['bar'];
    if (treinados.has(chave)) classes.push('on');
    if (chave === chaveHoje) classes.push('hoje');
    return `<div class="bar-col"><div class="${classes.join(' ')}"></div><span>${LABELS[i]}</span></div>`;
  }).join('');

  const pontos = diasSemana.map((d, i) => {
    const chave = d.toISOString().slice(0, 10);
    const y = treinados.has(chave) ? 6 : 24;
    const x = (i / 6) * 100;
    return `${x},${y}`;
  }).join(' ');
  document.querySelector('#freq-sparkline polyline').setAttribute('points', pontos);
}

function minutosAteAula(aula, diaAtual, horaAtualMin) {
  const [h, m] = aula.hora_inicio.split(':').map(Number);
  const diffDias = (aula.dia_semana - diaAtual + 7) % 7;
  let minutos = diffDias * 1440 + (h * 60 + m);
  if (diffDias === 0 && h * 60 + m < horaAtualMin) minutos += 7 * 1440;
  return minutos;
}

async function carregarAgenda() {
  try {
    const grade = await api.get('/api/aulas');
    const todasAulas = grade.flatMap((dia) => dia.aulas);

    const agora = new Date();
    const diaAtual = agora.getDay();
    const horaAtualMin = agora.getHours() * 60 + agora.getMinutes();

    const ordenadas = [...todasAulas].sort(
      (a, b) => minutosAteAula(a, diaAtual, horaAtualMin) - minutosAteAula(b, diaAtual, horaAtualMin)
    );

    const proxima = ordenadas[0];
    if (proxima) {
      const ehHoje = minutosAteAula(proxima, diaAtual, horaAtualMin) < 1440;
      document.getElementById('next-aula-nome').textContent =
        `${proxima.nome} — ${ehHoje ? 'hoje' : DIAS_ABREV[proxima.dia_semana]} ${proxima.hora_inicio.slice(0, 5)}`;
      document.getElementById('next-aula-prof').textContent = proxima.professor_nome ? `Prof. ${proxima.professor_nome}` : '';
    } else {
      document.getElementById('next-aula-nome').textContent = 'Nenhuma aula cadastrada';
    }

    const lista = document.getElementById('lista-agenda');
    lista.innerHTML = ordenadas.length
      ? ordenadas.slice(0, 5).map((a) => `
          <div class="agenda-item">
            <span class="agenda-dot"></span>${DIAS_ABREV[a.dia_semana]} ${a.hora_inicio.slice(0, 5)} — ${a.nome}
          </div>
        `).join('')
      : '<div class="empty-state">Nenhuma aula cadastrada.</div>';
  } catch (err) {
    document.getElementById('next-aula-nome').textContent = 'Não foi possível carregar a agenda.';
  }
}

document.getElementById('btn-checkin').addEventListener('click', async (ev) => {
  const btn = ev.currentTarget;
  btn.disabled = true;
  try {
    await api.post('/api/frequencias/checkin', {});
    toast('Treino registrado! +50 XP', 'success');
    btn.classList.add('success-burst');
    setTimeout(() => btn.classList.remove('success-burst'), 600);
    await Promise.all([carregarDashboard(), carregarCalendario(), carregarFrequenciaSemana()]);
  } catch (err) {
    toast(err.message || 'Erro ao registrar check-in.', 'error');
  } finally {
    btn.disabled = false;
  }
});

// ===== Sidebar mobile =====
const btnSidebarToggle = document.getElementById('btn-sidebar-toggle');
const sidebarEl = document.getElementById('sidebar');
const sidebarScrim = document.getElementById('sidebar-scrim');

function fecharSidebar() {
  sidebarEl.classList.remove('open');
  sidebarScrim.classList.remove('open');
  btnSidebarToggle.setAttribute('aria-expanded', 'false');
}
btnSidebarToggle.addEventListener('click', () => {
  const abrir = !sidebarEl.classList.contains('open');
  sidebarEl.classList.toggle('open', abrir);
  sidebarScrim.classList.toggle('open', abrir);
  btnSidebarToggle.setAttribute('aria-expanded', String(abrir));
});
sidebarScrim.addEventListener('click', fecharSidebar);

// ===== Painel de configurações =====
const configOverlay = document.getElementById('config-overlay');

function abrirConfig() {
  configOverlay.classList.add('open');
  carregarConfig();
}
function fecharConfig() {
  configOverlay.classList.remove('open');
}
document.getElementById('btn-open-config').addEventListener('click', abrirConfig);
document.getElementById('btn-close-config').addEventListener('click', fecharConfig);
configOverlay.addEventListener('click', (ev) => {
  if (ev.target === configOverlay) fecharConfig();
});

document.querySelectorAll('.drawer-nav-item').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.drawer-nav-item').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.drawer-section').forEach((s) => s.classList.remove('active'));
    btn.classList.add('active');
    document.querySelector(`.drawer-section[data-section-panel="${btn.dataset.section}"]`).classList.add('active');
  });
});

async function carregarConfig() {
  try {
    const u = await api.get('/api/alunos/perfil');
    document.getElementById('config-conta-nome').textContent = u.nome;
    document.getElementById('config-conta-email').textContent = u.email;
    document.getElementById('config-conta-telefone').textContent = u.telefone || 'Não informado';

    const toggle = document.getElementById('toggle-whatsapp');
    const ativo = u.notificacoes_whatsapp !== false;
    toggle.classList.toggle('on', ativo);
    toggle.setAttribute('aria-checked', String(ativo));
  } catch (err) {
    toast(err.message || 'Erro ao carregar configurações.', 'error');
  }
}

document.getElementById('toggle-whatsapp').addEventListener('click', async (ev) => {
  const toggle = ev.currentTarget;
  const novoValor = !toggle.classList.contains('on');
  toggle.classList.toggle('on', novoValor);
  toggle.setAttribute('aria-checked', String(novoValor));
  try {
    await api.patch('/api/alunos/perfil', { notificacoes_whatsapp: novoValor });
    toast('Salvo', 'success');
  } catch (err) {
    toggle.classList.toggle('on', !novoValor);
    toggle.setAttribute('aria-checked', String(!novoValor));
    toast(err.message || 'Erro ao salvar preferência.', 'error');
  }
});

document.getElementById('form-senha').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const btn = document.getElementById('btn-senha-salvar');
  setBtnLoading(btn, 'Salvando...');
  try {
    const res = await api.patch('/api/auth/senha', {
      senha_atual: document.getElementById('config-senha-atual').value,
      nova_senha: document.getElementById('config-senha-nova').value,
    });
    localStorage.setItem('token', res.token);
    document.getElementById('form-senha').reset();
    toast('Senha alterada!', 'success');
  } catch (err) {
    toast(err.message || 'Erro ao trocar senha.', 'error');
  } finally {
    resetBtnLoading(btn);
  }
});

carregarDashboard();
carregarCalendario();
carregarFrequenciaSemana();
carregarAgenda();
```

- [ ] **Step 2: Verificação manual (ponta a ponta)**

Com o backend local rodando (`cd backend && npm run dev`) e um usuário aluno de teste logado:

1. Abrir `frontend/dashboard.html` no navegador.
2. Confirmar que a sidebar aparece à esquerda com os 5 links + Configurações + Sair, e "Dashboard" destacado.
3. Confirmar que os 4 cards de estatística mostram sequência, frequência da semana, treinos totais e progresso de XP com dado real (não "—" nem `NaN`).
4. Confirmar que o gráfico de barras Seg–Dom aparece, com o dia de hoje marcado.
5. Confirmar que "Conquistas recentes", "Hoje" (com botão de check-in funcionando) e "Próxima aula" aparecem preenchidos.
6. Confirmar que a coluna direita mostra perfil, calendário do mês e agenda da semana.
7. Clicar em "Configurações" na sidebar — o drawer abre, navega entre as 5 seções, e:
   - Segurança: tentar trocar a senha com a senha atual errada → mostra toast de erro; com a senha certa → sucesso e o `token` no `localStorage` é atualizado.
   - Notificações: o toggle de WhatsApp liga/desliga e persiste (recarregar a página e reabrir o drawer confirma o estado salvo).
   - Aparência: os 3 botões (Claro/Escuro/Automático) trocam o tema da página.
8. Reduzir a largura da janela abaixo de 900px — a sidebar vira um drawer deslizante acionado pelo botão de menu no canto superior esquerdo.

- [ ] **Step 3: Commit**

```bash
git add frontend/assets/js/dashboard.js
git commit -m "feat(ui): dados reais e interações do novo dashboard (config, agenda, semana)"
```

---

## Verificação final (antes do push)

- [ ] Rodar a suíte completa do backend uma última vez:

```bash
cd backend && export NODE_ENV=test && npx jest --runInBand --forceExit
```
Expected: todas as suítes em PASS.

- [ ] Fazer a verificação manual ponta a ponta descrita na Task 10, Step 2.

- [ ] `git log --oneline -12` deve mostrar os 10 commits desta implementação em sequência, sem nada solto no `git status`.
