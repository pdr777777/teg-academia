# Integração Catraca Control iD — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sincronizar o TEG com as duas catracas Control iD iDFace MAX já instaladas — cadastro/foto automático, bloqueio de inadimplente, e check-in automático — convivendo com o CloudGym (que continua rodando) sem tocar em nada que ele já gerencia.

**Architecture:** Backend chama a API REST local das duas catracas (login por sessão + `load/create/destroy_objects.fcgi`) sempre que matrícula muda de estado. Um polling periódico lê `access_logs` novos e alimenta check-in (via as funções já existentes de sessão/frequência, extraídas para reuso) e um log de telemetria pro dashboard. Todo objeto criado pelo TEG na catraca usa `registration = "TEG-<usuario_id>"` e um grupo/regra de acesso próprio — nunca toca em objeto criado pelo CloudGym.

**Tech Stack:** Node/Express/PostgreSQL (stack já existente do backend), `fetch` nativo do Node (mesmo padrão já usado em `whatsappService.js`), Jest + Supertest pros testes.

## Global Constraints

- Nunca fixar o `id` de um objeto na catraca — sempre deixar o equipamento gerar e guardar o retorno na nossa base (`catraca_usuarios`).
- Todo `registration` criado pelo TEG usa o prefixo `TEG-` (ex: `TEG-42`) — nunca reutilizar/tocar um registro sem esse prefixo.
- Toda escrita (criar usuário, foto, grupo, bloqueio) é aplicada **nas duas catracas configuradas** (`CATRACA1_*` e `CATRACA2_*`), nunca só numa.
- **Não trocar o Modo de Operação das catracas** (ficam em Modo iDCloud) — a integração não depende disso.
- Falha de rede/timeout ao falar com uma catraca nunca derruba a requisição HTTP que disparou a ação — sempre isolada em try/catch, logada, sem propagar erro 500 pro cliente do endpoint que originou a chamada.
- `configuracoes.catraca_ativa = false` desliga toda a integração (chamadas viram no-op) sem precisar de redeploy.
- Sem acesso a equipamento real em CI — toda chamada HTTP externa é mockada nos testes automatizados. Validação contra hardware real é manual (Task 16).

---

### Task 1: Migration `029_catraca.sql`

**Files:**
- Create: `database/migrations/029_catraca.sql`
- Modify: `backend/src/config/schema.test.js`

**Interfaces:**
- Produces: tabelas `catraca_usuarios`, `catraca_cursor`, `catraca_eventos`; coluna `configuracoes.catraca_ativa`. Usadas por todas as tasks seguintes.

- [ ] **Step 1: Escrever a migration**

```sql
-- database/migrations/029_catraca.sql
-- Integração com as catracas Control iD iDFace MAX. Todo registro criado
-- pelo TEG na catraca usa registration com prefixo "TEG-" e nunca toca em
-- objeto criado pelo CloudGym (sistema antigo, continua rodando em paralelo).

CREATE TABLE catraca_usuarios (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  catraca VARCHAR(10) NOT NULL,
  catraca_user_id INTEGER NOT NULL,
  face_status VARCHAR(20) NOT NULL DEFAULT 'pendente_presencial'
    CHECK (face_status IN ('sincronizado', 'pendente_presencial', 'erro')),
  grupo_ativo BOOLEAN NOT NULL DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (usuario_id, catraca)
);

CREATE INDEX idx_catraca_usuarios_usuario_id ON catraca_usuarios(usuario_id);

CREATE TABLE catraca_cursor (
  catraca VARCHAR(10) PRIMARY KEY,
  ultimo_evento_id INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE catraca_eventos (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  catraca VARCHAR(10) NOT NULL,
  tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('autorizado', 'negado', 'nao_identificado')),
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_catraca_eventos_criado_em ON catraca_eventos(criado_em);
CREATE INDEX idx_catraca_eventos_usuario_id ON catraca_eventos(usuario_id);

ALTER TABLE configuracoes ADD COLUMN catraca_ativa BOOLEAN NOT NULL DEFAULT TRUE;
```

- [ ] **Step 2: Rodar a migration localmente**

Run: `cd backend && npm run migrate`
Expected: `Aplicando 029_catraca.sql... OK` seguido de `Migrations em dia.`

- [ ] **Step 3: Adicionar teste de schema**

Adicione ao final de `backend/src/config/schema.test.js`:

```js
describe('migration 029 — catraca', () => {
  afterAll(async () => {
    await pool.end();
  });

  test('tabelas da catraca existem com as colunas esperadas', async () => {
    const { rows } = await pool.query(`
      SELECT table_name, column_name FROM information_schema.columns
      WHERE table_name IN ('catraca_usuarios', 'catraca_cursor', 'catraca_eventos')
        AND table_schema = current_schema()
    `);
    const porTabela = rows.reduce((acc, r) => {
      (acc[r.table_name] ||= []).push(r.column_name);
      return acc;
    }, {});
    expect(porTabela.catraca_usuarios).toEqual(expect.arrayContaining([
      'usuario_id', 'catraca', 'catraca_user_id', 'face_status', 'grupo_ativo',
    ]));
    expect(porTabela.catraca_cursor).toEqual(expect.arrayContaining(['catraca', 'ultimo_evento_id']));
    expect(porTabela.catraca_eventos).toEqual(expect.arrayContaining(['usuario_id', 'catraca', 'tipo', 'criado_em']));
  });

  test('configuracoes tem catraca_ativa com default true', async () => {
    const { rows: [cfg] } = await pool.query('SELECT catraca_ativa FROM configuracoes WHERE id = 1');
    expect(cfg.catraca_ativa).toBe(true);
  });
});
```

Note: há duas `describe` no arquivo agora (a de migration 022 já existente + esta nova) — cada uma com seu próprio `afterAll(() => pool.end())`. Isso é seguro no Jest (cada describe roda seu afterAll), mas para evitar dois `pool.end()` na mesma suíte, **remova** o `afterAll` duplicado desta nova describe e deixe só o já existente no arquivo cobrir o encerramento do pool (ajuste ao colar o bloco acima).

- [ ] **Step 4: Rodar os testes**

Run: `cd backend && npm test -- schema.test.js`
Expected: PASS, 5 testes (3 antigos + 2 novos)

- [ ] **Step 5: Commit**

```bash
git add database/migrations/029_catraca.sql backend/src/config/schema.test.js
git commit -m "feat(catraca): migration com tabelas de mapeamento, cursor e eventos"
```

---

### Task 2: Cliente HTTP da API Control iD

**Files:**
- Create: `backend/src/services/catraca/controlIdClient.js`
- Create: `backend/src/services/catraca/controlIdClient.test.js`

**Interfaces:**
- Produces: `criarClienteCatraca({ nome, host, porta, usuario, senha })` → `{ nome, login, loadObjects, createObjects, destroyObjects, setUserImage }`; `CatracaOfflineError`, `CatracaAuthError`.
- Consumes: `fetch` nativo do Node (mesmo padrão de `backend/src/services/whatsappService.js:40`).

- [ ] **Step 1: Escrever os testes (mockando `global.fetch`)**

```js
// backend/src/services/catraca/controlIdClient.test.js
const { criarClienteCatraca, CatracaOfflineError } = require('./controlIdClient');

function respostaOk(json) {
  return { ok: true, status: 200, json: async () => json };
}

describe('criarClienteCatraca', () => {
  let fetchMock;
  beforeEach(() => {
    fetchMock = jest.fn();
    global.fetch = fetchMock;
  });

  function novoCliente() {
    return criarClienteCatraca({ nome: 'catraca1', host: '192.168.100.129', porta: '80', usuario: 'admin', senha: 'admin' });
  }

  test('loga automaticamente na primeira chamada e reaproveita a sessão', async () => {
    fetchMock
      .mockResolvedValueOnce(respostaOk({ session: 'sess-123' }))
      .mockResolvedValueOnce(respostaOk({ users: [{ id: 1, name: 'Fulano' }] }));

    const client = novoCliente();
    const usuarios = await client.loadObjects('users', { fields: ['id', 'name'] });

    expect(usuarios).toEqual([{ id: 1, name: 'Fulano' }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0].toString()).toContain('/login.fcgi');
    expect(fetchMock.mock.calls[1][0].toString()).toContain('session=sess-123');

    await client.loadObjects('users', { fields: ['id'] });
    expect(fetchMock).toHaveBeenCalledTimes(3); // não logou de novo
  });

  test('createObjects retorna os ids criados', async () => {
    fetchMock
      .mockResolvedValueOnce(respostaOk({ session: 'sess-123' }))
      .mockResolvedValueOnce(respostaOk({ ids: [42] }));

    const client = novoCliente();
    const ids = await client.createObjects('users', [{ registration: 'TEG-1', name: 'Fulano', password: 'x' }]);
    expect(ids).toEqual([42]);
  });

  test('destroyObjects retorna a quantidade de linhas removidas', async () => {
    fetchMock
      .mockResolvedValueOnce(respostaOk({ session: 'sess-123' }))
      .mockResolvedValueOnce(respostaOk({ changes: 1 }));

    const client = novoCliente();
    const changes = await client.destroyObjects('user_groups', { user_id: 1, group_id: 2 });
    expect(changes).toBe(1);
  });

  test('reautentica uma vez quando a sessão expira (401) e repete a chamada', async () => {
    fetchMock
      .mockResolvedValueOnce(respostaOk({ session: 'sess-velha' }))
      .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) })
      .mockResolvedValueOnce(respostaOk({ session: 'sess-nova' }))
      .mockResolvedValueOnce(respostaOk({ users: [] }));

    const client = novoCliente();
    const usuarios = await client.loadObjects('users', { fields: ['id'] });
    expect(usuarios).toEqual([]);
    expect(fetchMock.mock.calls[3][0].toString()).toContain('session=sess-nova');
  });

  test('lança CatracaOfflineError quando a rede falha', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNREFUSED'));
    const client = novoCliente();
    await expect(client.loadObjects('users', { fields: ['id'] })).rejects.toThrow(CatracaOfflineError);
  });
});
```

- [ ] **Step 2: Rodar os testes e ver falhar**

Run: `cd backend && npm test -- controlIdClient.test.js`
Expected: FAIL com `Cannot find module './controlIdClient'`

- [ ] **Step 3: Implementar o cliente**

```js
// backend/src/services/catraca/controlIdClient.js
class CatracaOfflineError extends Error {}
class CatracaAuthError extends Error {}

const TIMEOUT_MS = 5000;

function criarClienteCatraca({ nome, host, porta, usuario, senha }) {
  const baseUrl = `http://${host}:${porta}`;
  let session = null;

  async function requisitar(caminho, { body, isBinary = false, comSessao = true, jaTentouRelogin = false } = {}) {
    if (comSessao && !session) await login();

    const url = new URL(`${baseUrl}/${caminho}`);
    if (comSessao) url.searchParams.set('session', session);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

    let res;
    try {
      res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': isBinary ? 'application/octet-stream' : 'application/json' },
        body: isBinary ? body : JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      throw new CatracaOfflineError(`Catraca ${nome} inacessível: ${err.message}`);
    } finally {
      clearTimeout(timeoutId);
    }

    if (res.status === 401 && comSessao && !jaTentouRelogin) {
      session = null;
      await login();
      return requisitar(caminho, { body, isBinary, comSessao, jaTentouRelogin: true });
    }
    if (!res.ok) {
      throw new Error(`Catraca ${nome} respondeu ${res.status} em ${caminho}`);
    }
    return res.json();
  }

  async function login() {
    let resposta;
    try {
      resposta = await requisitar('login.fcgi', { body: { login: usuario, password: senha }, comSessao: false });
    } catch (err) {
      if (err instanceof CatracaOfflineError) throw err;
      throw new CatracaAuthError(`Falha ao logar na catraca ${nome}: ${err.message}`);
    }
    session = resposta.session;
  }

  async function loadObjects(object, { fields, where, order, limit, offset } = {}) {
    const resposta = await requisitar('load_objects.fcgi', { body: { object, fields, where, order, limit, offset } });
    return resposta[object] || [];
  }

  async function createObjects(object, values) {
    const resposta = await requisitar('create_objects.fcgi', { body: { object, values } });
    return resposta.ids;
  }

  async function destroyObjects(object, where) {
    const resposta = await requisitar('destroy_objects.fcgi', { body: { object, where: { [object]: where } } });
    return resposta.changes;
  }

  async function setUserImage(userId, imagemBuffer) {
    if (!session) await login();
    const url = new URL(`${baseUrl}/user_set_image.fcgi`);
    url.searchParams.set('session', session);
    url.searchParams.set('user_id', userId);

    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream' },
      body: imagemBuffer,
    });
    if (!res.ok) throw new Error(`Falha ao enviar foto pra catraca ${nome}: ${res.status}`);
  }

  return { nome, login, loadObjects, createObjects, destroyObjects, setUserImage };
}

module.exports = { criarClienteCatraca, CatracaOfflineError, CatracaAuthError };
```

- [ ] **Step 4: Rodar os testes e ver passar**

Run: `cd backend && npm test -- controlIdClient.test.js`
Expected: PASS, 5 testes

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/catraca/controlIdClient.js backend/src/services/catraca/controlIdClient.test.js
git commit -m "feat(catraca): cliente HTTP de baixo nível pra API Control iD"
```

---

### Task 3: Extrair `sessaoService.js` de `sessoes.js`

Puro refactor de extração — nenhuma mudança de comportamento. Necessário porque `catracaService` (Task 6) precisa reaproveitar `iniciarSessao` sem depender de um arquivo de rota.

**Files:**
- Create: `backend/src/services/sessaoService.js`
- Modify: `backend/src/routes/sessoes.js:1-53` (remove as duas funções, importa do service)
- Test: `backend/src/routes/sessoes.test.js` (já existente — não deve precisar de mudança nenhuma; roda de novo pra confirmar)

**Interfaces:**
- Produces: `sessaoService.iniciarSessao(usuario_id, treino_id, origem)` → `Promise<treino_sessao>` (lança erro com `.status = 400` quando não há treino atribuído).
- Consumes: `pool` (`../config/db`).

- [ ] **Step 1: Criar o service com o código extraído**

```js
// backend/src/services/sessaoService.js
const pool = require('../config/db');

async function treinoAtivoDoAluno(usuario_id) {
  const { rows: [treino] } = await pool.query(
    `SELECT t.id FROM treino_alunos ta JOIN treinos t ON t.id = ta.treino_id
     WHERE ta.usuario_id = $1 AND ta.ativo = TRUE LIMIT 1`,
    [usuario_id]
  );
  return treino?.id || null;
}

async function iniciarSessao(usuario_id, treino_id, origem) {
  const treinoId = treino_id || await treinoAtivoDoAluno(usuario_id);
  if (!treinoId) {
    const err = new Error('Aluno não tem treino atribuído');
    err.status = 400;
    throw err;
  }

  try {
    const { rows: [sessao] } = await pool.query(
      `INSERT INTO treino_sessoes (usuario_id, treino_id, origem) VALUES ($1, $2, $3) RETURNING *`,
      [usuario_id, treinoId, origem]
    );
    return sessao;
  } catch (err) {
    if (err.code === '23505') {
      // já existe sessão em andamento — devolve ela em vez de duplicar
      const { rows: [existente] } = await pool.query(
        `SELECT * FROM treino_sessoes WHERE usuario_id = $1 AND status = 'em_andamento'`,
        [usuario_id]
      );
      return existente;
    }
    throw err;
  }
}

module.exports = { iniciarSessao, treinoAtivoDoAluno };
```

- [ ] **Step 2: Atualizar `sessoes.js` pra usar o service**

Em `backend/src/routes/sessoes.js`, substitua as linhas 1-42 (imports + `treinoAtivoDoAluno` + `iniciarSessao` locais) por:

```js
const express = require('express');
const pool = require('../config/db');
const { authMiddleware } = require('../middleware/authMiddleware');
const xpService = require('../services/xpService');
const sessaoService = require('../services/sessaoService');

const router = express.Router();
```

E troque as duas chamadas restantes no arquivo:
- Linha `const sessao = await iniciarSessao(req.user.id, req.body.treino_id, 'manual');` → `const sessao = await sessaoService.iniciarSessao(req.user.id, req.body.treino_id, 'manual');`
- Linha `const sessao = await iniciarSessao(usuarioId, null, 'catraca');` → `const sessao = await sessaoService.iniciarSessao(usuarioId, null, 'catraca');`

- [ ] **Step 3: Rodar a suíte de sessões e confirmar que nada quebrou**

Run: `cd backend && npm test -- sessoes.test.js`
Expected: PASS, mesmos testes de antes, sem alteração

- [ ] **Step 4: Commit**

```bash
git add backend/src/services/sessaoService.js backend/src/routes/sessoes.js
git commit -m "refactor(sessoes): extrai iniciarSessao pra sessaoService.js"
```

---

### Task 4: Extrair `frequenciaService.js` de `frequencias.js`

Mesmo tipo de refactor puro da Task 3, pro check-in de presença.

**Files:**
- Create: `backend/src/services/frequenciaService.js`
- Modify: `backend/src/routes/frequencias.js:1-31`
- Test: `backend/src/routes/frequencias.test.js` (já existente, roda de novo)

**Interfaces:**
- Produces: `frequenciaService.registrarCheckin(usuarioId, origem)` → `Promise<frequencia | null>` (retorna `null`, sem lançar erro, quando já existe check-in no dia).
- Consumes: `pool`, `xpService.adicionarXP`, `xpService.atualizarSequencia`.

- [ ] **Step 1: Criar o service**

```js
// backend/src/services/frequenciaService.js
const pool = require('../config/db');
const xpService = require('./xpService');

async function registrarCheckin(usuarioId, origem = 'app') {
  const hoje = new Date().toISOString().split('T')[0];

  const { rows: existing } = await pool.query(
    'SELECT id FROM frequencias WHERE usuario_id = $1 AND data = $2',
    [usuarioId, hoje]
  );
  if (existing[0]) return null;

  const { rows: [freq] } = await pool.query(
    'INSERT INTO frequencias (usuario_id, data) VALUES ($1, $2) RETURNING *',
    [usuarioId, hoje]
  );

  await xpService.adicionarXP(usuarioId, 50, 'treino');
  await xpService.atualizarSequencia(usuarioId);

  return freq;
}

module.exports = { registrarCheckin };
```

Nota: o parâmetro `origem` fica na assinatura pra deixar explícito quem chamou (app × catraca), mas não é persistido em `frequencias` — a telemetria de origem já vive em `catraca_eventos` (Task 1), então não duplicamos a coluna aqui.

- [ ] **Step 2: Atualizar a rota de check-in pra usar o service**

Em `backend/src/routes/frequencias.js`, troque o handler `POST /checkin` (linhas 8-31) por:

```js
const frequenciaService = require('../services/frequenciaService');

// POST /api/frequencias/checkin
router.post('/checkin', authMiddleware, async (req, res, next) => {
  try {
    const freq = await frequenciaService.registrarCheckin(req.user.id, 'app');
    if (!freq) return res.status(409).json({ error: 'Check-in já realizado hoje' });
    res.status(201).json(freq);
  } catch (err) {
    next(err);
  }
});
```

Remova o `require('../services/xpService')` do topo do arquivo se não for mais usado em nenhum outro handler de `frequencias.js` (confira antes de remover — os outros handlers do arquivo não usam `xpService` diretamente, então pode remover).

- [ ] **Step 3: Rodar a suíte de frequências**

Run: `cd backend && npm test -- frequencias.test.js`
Expected: PASS, mesmo comportamento de antes (201 no primeiro check-in, 409 no segundo)

- [ ] **Step 4: Commit**

```bash
git add backend/src/services/frequenciaService.js backend/src/routes/frequencias.js
git commit -m "refactor(frequencias): extrai registrarCheckin pra frequenciaService.js"
```

---

### Task 5: Config de dispositivos + `.env.example`

**Files:**
- Create: `backend/src/services/catraca/config.js`
- Create: `backend/src/services/catraca/config.test.js`
- Modify: `backend/.env.example`

**Interfaces:**
- Produces: `catracasConfiguradas()` → array de clientes (`criarClienteCatraca`), um por catraca que tiver `CATRACA<N>_HOST` definido no ambiente. Consumido por toda `catracaService.js` (Task 6+).
- Consumes: `criarClienteCatraca` (Task 2).

- [ ] **Step 1: Escrever o teste**

```js
// backend/src/services/catraca/config.test.js
describe('catracasConfiguradas', () => {
  const originalEnv = { ...process.env };
  afterEach(() => {
    process.env = { ...originalEnv };
    jest.resetModules();
  });

  test('retorna uma catraca por dispositivo configurado, ignorando os que não têm HOST', () => {
    process.env.CATRACA1_HOST = '192.168.100.129';
    process.env.CATRACA1_PORT = '80';
    process.env.CATRACA1_USER = 'admin';
    process.env.CATRACA1_PASSWORD = 'admin';
    delete process.env.CATRACA2_HOST;

    const { catracasConfiguradas } = require('./config');
    const clientes = catracasConfiguradas();

    expect(clientes).toHaveLength(1);
    expect(clientes[0].nome).toBe('catraca1');
  });

  test('retorna as duas catracas quando as duas estão configuradas', () => {
    process.env.CATRACA1_HOST = '192.168.100.129';
    process.env.CATRACA1_USER = 'admin';
    process.env.CATRACA1_PASSWORD = 'admin';
    process.env.CATRACA2_HOST = '192.168.100.130';
    process.env.CATRACA2_USER = 'admin';
    process.env.CATRACA2_PASSWORD = 'admin';

    const { catracasConfiguradas } = require('./config');
    expect(catracasConfiguradas().map((c) => c.nome)).toEqual(['catraca1', 'catraca2']);
  });

  test('retorna array vazio quando nenhuma catraca está configurada', () => {
    delete process.env.CATRACA1_HOST;
    delete process.env.CATRACA2_HOST;
    const { catracasConfiguradas } = require('./config');
    expect(catracasConfiguradas()).toEqual([]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && npm test -- catraca/config.test.js`
Expected: FAIL com `Cannot find module './config'`

- [ ] **Step 3: Implementar**

```js
// backend/src/services/catraca/config.js
const { criarClienteCatraca } = require('./controlIdClient');

function catracasConfiguradas() {
  return [1, 2]
    .filter((n) => process.env[`CATRACA${n}_HOST`])
    .map((n) => criarClienteCatraca({
      nome: `catraca${n}`,
      host: process.env[`CATRACA${n}_HOST`],
      porta: process.env[`CATRACA${n}_PORT`] || '80',
      usuario: process.env[`CATRACA${n}_USER`],
      senha: process.env[`CATRACA${n}_PASSWORD`],
    }));
}

module.exports = { catracasConfiguradas };
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd backend && npm test -- catraca/config.test.js`
Expected: PASS, 3 testes

- [ ] **Step 5: Documentar as env vars novas**

Adicione ao final de `backend/.env.example`:

```
CATRACA1_HOST=192.168.100.129
CATRACA1_PORT=80
CATRACA1_USER=admin
CATRACA1_PASSWORD=troque_pela_senha_real
CATRACA2_HOST=192.168.100.130
CATRACA2_PORT=80
CATRACA2_USER=admin
CATRACA2_PASSWORD=troque_pela_senha_real
```

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/catraca/config.js backend/src/services/catraca/config.test.js backend/.env.example
git commit -m "feat(catraca): lê configuração das duas catracas via env vars"
```

---

### Task 6: `catracaService` — bootstrap da estrutura de acesso + `sincronizarAluno`

Esta é a task com mais risco de premissa errada sobre a API real (grupo/regra/horário/portal). **Antes de seguir pras próximas tasks, valide o Step 5 (bootstrap) contra UMA catraca real** (credenciais que o Matias já tem) — se `portals`/`access_rules` se comportarem diferente do documentado, ajuste aqui antes de propagar o padrão pro resto do serviço.

**Files:**
- Create: `backend/src/services/catracaService.js`
- Create: `backend/src/services/catracaService.test.js`

**Interfaces:**
- Consumes: `catracasConfiguradas` (Task 5), `pool`.
- Produces: `catracaService.garantirEstruturaBase(client)` → `Promise<number>` (id do grupo `TEG-ativos`); `catracaService.sincronizarAluno(usuarioId)` → `Promise<void>`. Usado por Task 7 (liberar/bloquear), Task 8 (hooks) e Task 12 (rota manual de sync).

- [ ] **Step 1: Escrever os testes**

```js
// backend/src/services/catracaService.test.js
jest.mock('./catraca/config');
const { catracasConfiguradas } = require('./catraca/config');
const pool = require('../config/db');
const { criarUsuario } = require('../testUtils/fixtures');
const catracaService = require('./catracaService');

function clienteFalso() {
  return {
    nome: 'catraca1',
    loadObjects: jest.fn().mockResolvedValue([]),
    createObjects: jest.fn().mockResolvedValue([999]),
    destroyObjects: jest.fn().mockResolvedValue(1),
    setUserImage: jest.fn().mockResolvedValue(undefined),
    login: jest.fn().mockResolvedValue(undefined),
  };
}

describe('garantirEstruturaBase', () => {
  test('cria grupo, regra, horário e vínculos quando nada existe ainda', async () => {
    const client = clienteFalso();
    // loadObjects sempre vazio → tudo é criado do zero
    const grupoId = await catracaService.garantirEstruturaBase(client);

    expect(grupoId).toBe(999);
    const chamadasCreate = client.createObjects.mock.calls.map((c) => c[0]);
    expect(chamadasCreate).toEqual(expect.arrayContaining([
      'groups', 'access_rules', 'time_zones', 'time_spans', 'access_rule_time_zones', 'group_access_rules',
    ]));
  });

  test('não recria nada quando grupo/regra/horário já existem', async () => {
    const client = clienteFalso();
    client.loadObjects = jest.fn(async (object) => {
      if (object === 'groups') return [{ id: 1, name: 'TEG-ativos' }];
      if (object === 'access_rules') return [{ id: 2, name: 'TEG-liberado' }];
      if (object === 'time_zones') return [{ id: 3, name: 'TEG-sempre' }];
      if (object === 'access_rule_time_zones') return [{ access_rule_id: 2, time_zone_id: 3 }];
      if (object === 'group_access_rules') return [{ group_id: 1, access_rule_id: 2 }];
      if (object === 'portals') return [];
      return [];
    });

    const grupoId = await catracaService.garantirEstruturaBase(client);
    expect(grupoId).toBe(1);
    expect(client.createObjects).not.toHaveBeenCalled();
  });
});

describe('sincronizarAluno', () => {
  async function limpar(usuarioId) {
    await pool.query('DELETE FROM catraca_usuarios WHERE usuario_id = $1', [usuarioId]);
    await pool.query('DELETE FROM usuarios WHERE id = $1', [usuarioId]);
  }

  test('cria usuário na catraca com registration TEG-<id> e guarda o mapeamento', async () => {
    const client = clienteFalso();
    catracasConfiguradas.mockReturnValue([client]);
    const aluno = await criarUsuario({ nome: 'Aluno Catraca' });

    await catracaService.sincronizarAluno(aluno.id);

    const criarUsuarioChamada = client.createObjects.mock.calls.find((c) => c[0] === 'users');
    expect(criarUsuarioChamada[1][0].registration).toBe(`TEG-${aluno.id}`);

    const { rows: [mapeamento] } = await pool.query(
      'SELECT * FROM catraca_usuarios WHERE usuario_id = $1 AND catraca = $2', [aluno.id, 'catraca1']
    );
    expect(mapeamento.catraca_user_id).toBe(999);
    expect(mapeamento.face_status).toBe('pendente_presencial');

    await limpar(aluno.id);
  });

  test('é idempotente — não cria usuário de novo se já existe mapeamento', async () => {
    const client = clienteFalso();
    catracasConfiguradas.mockReturnValue([client]);
    const aluno = await criarUsuario({ nome: 'Aluno Catraca 2' });

    await catracaService.sincronizarAluno(aluno.id);
    client.createObjects.mockClear();
    await catracaService.sincronizarAluno(aluno.id);

    const criouUsuarioDeNovo = client.createObjects.mock.calls.some((c) => c[0] === 'users');
    expect(criouUsuarioDeNovo).toBe(false);

    await limpar(aluno.id);
  });

  test('marca face_status como erro quando o envio da foto falha', async () => {
    const client = clienteFalso();
    client.setUserImage = jest.fn().mockRejectedValue(new Error('foto inválida'));
    catracasConfiguradas.mockReturnValue([client]);
    global.fetch = jest.fn().mockResolvedValue({ ok: true, arrayBuffer: async () => new ArrayBuffer(8) });

    const aluno = await criarUsuario({ nome: 'Aluno Sem Foto Boa', foto_url: 'https://exemplo.com/foto.jpg' });
    await pool.query('UPDATE usuarios SET foto_url = $1 WHERE id = $2', ['https://exemplo.com/foto.jpg', aluno.id]);

    await catracaService.sincronizarAluno(aluno.id);

    const { rows: [mapeamento] } = await pool.query(
      'SELECT face_status FROM catraca_usuarios WHERE usuario_id = $1', [aluno.id]
    );
    expect(mapeamento.face_status).toBe('pendente_presencial');

    await limpar(aluno.id);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && npm test -- catracaService.test.js`
Expected: FAIL com `Cannot find module './catracaService'`

- [ ] **Step 3: Implementar `garantirEstruturaBase` e `sincronizarAluno`**

```js
// backend/src/services/catracaService.js
const crypto = require('crypto');
const pool = require('../config/db');
const { catracasConfiguradas } = require('./catraca/config');

const GRUPO_NOME = 'TEG-ativos';
const REGRA_NOME = 'TEG-liberado';
const HORARIO_NOME = 'TEG-sempre';

async function garantirGrupo(client) {
  const existentes = await client.loadObjects('groups', { fields: ['id', 'name'], where: { groups: { name: GRUPO_NOME } } });
  if (existentes[0]) return existentes[0].id;
  const [id] = await client.createObjects('groups', [{ name: GRUPO_NOME }]);
  return id;
}

async function garantirRegraDeAcesso(client) {
  const existentes = await client.loadObjects('access_rules', { fields: ['id', 'name'], where: { access_rules: { name: REGRA_NOME } } });
  if (existentes[0]) return existentes[0].id;
  const [id] = await client.createObjects('access_rules', [{ name: REGRA_NOME, type: 1, priority: 0 }]);
  return id;
}

async function garantirHorarioIrrestrito(client) {
  const existentes = await client.loadObjects('time_zones', { fields: ['id', 'name'], where: { time_zones: { name: HORARIO_NOME } } });
  if (existentes[0]) return existentes[0].id;

  const [timeZoneId] = await client.createObjects('time_zones', [{ name: HORARIO_NOME }]);
  await client.createObjects('time_spans', [{
    time_zone_id: timeZoneId, start: 0, end: 86399,
    sun: 1, mon: 1, tue: 1, wed: 1, thu: 1, fri: 1, sat: 1, hol1: 1, hol2: 1, hol3: 1,
  }]);
  return timeZoneId;
}

async function garantirVinculo(client, object, campos) {
  const existentes = await client.loadObjects(object, { fields: Object.keys(campos), where: { [object]: campos } });
  if (existentes[0]) return;
  await client.createObjects(object, [campos]);
}

async function garantirEstruturaBase(client) {
  const grupoId = await garantirGrupo(client);
  const regraId = await garantirRegraDeAcesso(client);
  const timeZoneId = await garantirHorarioIrrestrito(client);

  await garantirVinculo(client, 'access_rule_time_zones', { access_rule_id: regraId, time_zone_id: timeZoneId });
  await garantirVinculo(client, 'group_access_rules', { group_id: grupoId, access_rule_id: regraId });

  const portais = await client.loadObjects('portals', { fields: ['id'] });
  for (const portal of portais) {
    await garantirVinculo(client, 'portal_access_rules', { portal_id: portal.id, access_rule_id: regraId });
  }

  return grupoId;
}

async function sincronizarAluno(usuarioId) {
  const { rows: [aluno] } = await pool.query('SELECT id, nome, foto_url FROM usuarios WHERE id = $1', [usuarioId]);
  if (!aluno) throw new Error(`Usuário ${usuarioId} não encontrado`);

  for (const client of catracasConfiguradas()) {
    await garantirEstruturaBase(client);

    const { rows: [mapeamento] } = await pool.query(
      'SELECT * FROM catraca_usuarios WHERE usuario_id = $1 AND catraca = $2',
      [usuarioId, client.nome]
    );

    let catracaUserId = mapeamento?.catraca_user_id;
    if (!catracaUserId) {
      const [id] = await client.createObjects('users', [{
        registration: `TEG-${usuarioId}`,
        name: aluno.nome,
        password: crypto.randomBytes(8).toString('hex'),
      }]);
      catracaUserId = id;
    }

    let faceStatus = mapeamento?.face_status || 'pendente_presencial';
    if (aluno.foto_url && faceStatus !== 'sincronizado') {
      try {
        const resposta = await fetch(aluno.foto_url);
        const buffer = Buffer.from(await resposta.arrayBuffer());
        await client.setUserImage(catracaUserId, buffer);
        faceStatus = 'sincronizado';
      } catch {
        faceStatus = 'pendente_presencial';
      }
    }

    await pool.query(
      `INSERT INTO catraca_usuarios (usuario_id, catraca, catraca_user_id, face_status)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (usuario_id, catraca) DO UPDATE SET
         catraca_user_id = EXCLUDED.catraca_user_id, face_status = EXCLUDED.face_status, updated_at = NOW()`,
      [usuarioId, client.nome, catracaUserId, faceStatus]
    );
  }
}

module.exports = {
  garantirGrupo,
  garantirEstruturaBase,
  sincronizarAluno,
};
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd backend && npm test -- catracaService.test.js`
Expected: PASS, 5 testes

- [ ] **Step 5: Validação manual contra UMA catraca real (checkpoint, não é código)**

Antes de seguir: rode manualmente (script Node avulso ou REPL) `sincronizarAluno` apontando `CATRACA1_HOST` pra uma das duas catracas reais com a conta de teste (Matias). Confira na tela da catraca (Cadastrar → Usuários) que apareceu um usuário `TEG-<id>` novo, sem sumir nenhum dos ~4796 existentes. Se `portals`/`access_rules` não se comportarem como o esperado, ajuste `garantirEstruturaBase` antes de prosseguir pra Task 7.

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/catracaService.js backend/src/services/catracaService.test.js
git commit -m "feat(catraca): bootstrap de grupo/regra/horário + sincronizarAluno"
```

---

### Task 7: `catracaService` — `liberarAcesso` / `bloquearAcesso`

**Files:**
- Modify: `backend/src/services/catracaService.js`
- Modify: `backend/src/services/catracaService.test.js`

**Interfaces:**
- Consumes: `garantirGrupo` (Task 6).
- Produces: `catracaService.liberarAcesso(usuarioId)`, `catracaService.bloquearAcesso(usuarioId)` — usados por Task 8 (jobWorker) e Task 9 (hooks de pagamento).

- [ ] **Step 1: Adicionar os testes**

```js
describe('liberarAcesso / bloquearAcesso', () => {
  async function limpar(usuarioId) {
    await pool.query('DELETE FROM catraca_usuarios WHERE usuario_id = $1', [usuarioId]);
    await pool.query('DELETE FROM usuarios WHERE id = $1', [usuarioId]);
  }

  test('liberarAcesso vincula o usuário ao grupo TEG-ativos e marca grupo_ativo', async () => {
    const client = clienteFalso();
    client.loadObjects = jest.fn(async (object) => (object === 'groups' ? [{ id: 1, name: 'TEG-ativos' }] : []));
    catracasConfiguradas.mockReturnValue([client]);

    const aluno = await criarUsuario({ nome: 'Aluno Liberar' });
    await pool.query(
      `INSERT INTO catraca_usuarios (usuario_id, catraca, catraca_user_id) VALUES ($1, 'catraca1', 555)`,
      [aluno.id]
    );

    await catracaService.liberarAcesso(aluno.id);

    const vinculoCriado = client.createObjects.mock.calls.find((c) => c[0] === 'user_groups');
    expect(vinculoCriado[1][0]).toEqual({ user_id: 555, group_id: 1 });

    const { rows: [mapeamento] } = await pool.query('SELECT grupo_ativo FROM catraca_usuarios WHERE usuario_id = $1', [aluno.id]);
    expect(mapeamento.grupo_ativo).toBe(true);

    await limpar(aluno.id);
  });

  test('bloquearAcesso remove o vínculo e marca grupo_ativo como falso', async () => {
    const client = clienteFalso();
    client.loadObjects = jest.fn(async (object) => (object === 'groups' ? [{ id: 1, name: 'TEG-ativos' }] : []));
    catracasConfiguradas.mockReturnValue([client]);

    const aluno = await criarUsuario({ nome: 'Aluno Bloquear' });
    await pool.query(
      `INSERT INTO catraca_usuarios (usuario_id, catraca, catraca_user_id, grupo_ativo) VALUES ($1, 'catraca1', 556, TRUE)`,
      [aluno.id]
    );

    await catracaService.bloquearAcesso(aluno.id);

    expect(client.destroyObjects).toHaveBeenCalledWith('user_groups', { user_id: 556, group_id: 1 });

    const { rows: [mapeamento] } = await pool.query('SELECT grupo_ativo FROM catraca_usuarios WHERE usuario_id = $1', [aluno.id]);
    expect(mapeamento.grupo_ativo).toBe(false);

    await limpar(aluno.id);
  });

  test('não faz nada quando o aluno ainda não foi sincronizado nessa catraca', async () => {
    const client = clienteFalso();
    catracasConfiguradas.mockReturnValue([client]);
    const aluno = await criarUsuario({ nome: 'Aluno Nunca Sincronizado' });

    await catracaService.bloquearAcesso(aluno.id);
    expect(client.destroyObjects).not.toHaveBeenCalled();

    await limpar(aluno.id);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && npm test -- catracaService.test.js`
Expected: FAIL — `liberarAcesso`/`bloquearAcesso` não existem ainda

- [ ] **Step 3: Implementar**

Adicione em `backend/src/services/catracaService.js`, antes do `module.exports`:

```js
async function liberarAcesso(usuarioId) {
  for (const client of catracasConfiguradas()) {
    const { rows: [mapeamento] } = await pool.query(
      'SELECT catraca_user_id FROM catraca_usuarios WHERE usuario_id = $1 AND catraca = $2',
      [usuarioId, client.nome]
    );
    if (!mapeamento) continue;

    const grupoId = await garantirGrupo(client);
    await garantirVinculo(client, 'user_groups', { user_id: mapeamento.catraca_user_id, group_id: grupoId });
    await pool.query(
      'UPDATE catraca_usuarios SET grupo_ativo = TRUE, updated_at = NOW() WHERE usuario_id = $1 AND catraca = $2',
      [usuarioId, client.nome]
    );
  }
}

async function bloquearAcesso(usuarioId) {
  for (const client of catracasConfiguradas()) {
    const { rows: [mapeamento] } = await pool.query(
      'SELECT catraca_user_id FROM catraca_usuarios WHERE usuario_id = $1 AND catraca = $2',
      [usuarioId, client.nome]
    );
    if (!mapeamento) continue;

    const grupoId = await garantirGrupo(client);
    await client.destroyObjects('user_groups', { user_id: mapeamento.catraca_user_id, group_id: grupoId });
    await pool.query(
      'UPDATE catraca_usuarios SET grupo_ativo = FALSE, updated_at = NOW() WHERE usuario_id = $1 AND catraca = $2',
      [usuarioId, client.nome]
    );
  }
}
```

E troque o `module.exports` pra:

```js
module.exports = {
  garantirGrupo,
  garantirEstruturaBase,
  sincronizarAluno,
  liberarAcesso,
  bloquearAcesso,
};
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd backend && npm test -- catracaService.test.js`
Expected: PASS, 8 testes

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/catracaService.js backend/src/services/catracaService.test.js
git commit -m "feat(catraca): liberarAcesso e bloquearAcesso via grupo TEG-ativos"
```

---

### Task 8: `catracaService` — `processarNovosAcessos`

**Files:**
- Modify: `backend/src/services/catracaService.js`
- Modify: `backend/src/services/catracaService.test.js`

**Interfaces:**
- Consumes: `sessaoService.iniciarSessao` (Task 3), `frequenciaService.registrarCheckin` (Task 4).
- Produces: `catracaService.processarNovosAcessos()` — usada pelo `jobWorker` (Task 10).

- [ ] **Step 1: Adicionar os testes**

```js
jest.mock('./sessaoService');
jest.mock('./frequenciaService');
const sessaoService = require('./sessaoService');
const frequenciaService = require('./frequenciaService');

describe('processarNovosAcessos', () => {
  async function limpar(usuarioId) {
    await pool.query('DELETE FROM catraca_eventos WHERE usuario_id = $1', [usuarioId]);
    await pool.query('DELETE FROM catraca_cursor WHERE catraca = $1', ['catraca1']);
    await pool.query('DELETE FROM catraca_usuarios WHERE usuario_id = $1', [usuarioId]);
    await pool.query('DELETE FROM usuarios WHERE id = $1', [usuarioId]);
  }

  beforeEach(() => {
    sessaoService.iniciarSessao.mockReset();
    frequenciaService.registrarCheckin.mockReset();
  });

  test('evento autorizado de usuário TEG gera sessão + check-in e avança o cursor', async () => {
    const aluno = await criarUsuario({ nome: 'Aluno Evento' });
    await pool.query(
      `INSERT INTO catraca_usuarios (usuario_id, catraca, catraca_user_id) VALUES ($1, 'catraca1', 777)`,
      [aluno.id]
    );
    sessaoService.iniciarSessao.mockResolvedValue({ id: 1 });
    frequenciaService.registrarCheckin.mockResolvedValue({ id: 1 });

    const client = clienteFalso();
    client.loadObjects = jest.fn(async (object) => {
      if (object === 'access_logs') return [{ id: 10, time: Math.floor(Date.now() / 1000), event: 7, user_id: 777 }];
      return [];
    });
    catracasConfiguradas.mockReturnValue([client]);

    await catracaService.processarNovosAcessos();

    expect(sessaoService.iniciarSessao).toHaveBeenCalledWith(aluno.id, null, 'catraca');
    expect(frequenciaService.registrarCheckin).toHaveBeenCalledWith(aluno.id, 'catraca');

    const { rows: [evento] } = await pool.query('SELECT * FROM catraca_eventos WHERE usuario_id = $1', [aluno.id]);
    expect(evento.tipo).toBe('autorizado');

    const { rows: [cursor] } = await pool.query('SELECT ultimo_evento_id FROM catraca_cursor WHERE catraca = $1', ['catraca1']);
    expect(cursor.ultimo_evento_id).toBe(10);

    await limpar(aluno.id);
  });

  test('não quebra quando o aluno não tem treino atribuído (iniciarSessao rejeita)', async () => {
    const aluno = await criarUsuario({ nome: 'Aluno Sem Treino Catraca' });
    await pool.query(
      `INSERT INTO catraca_usuarios (usuario_id, catraca, catraca_user_id) VALUES ($1, 'catraca1', 778)`,
      [aluno.id]
    );
    const semTreino = new Error('Aluno não tem treino atribuído');
    semTreino.status = 400;
    sessaoService.iniciarSessao.mockRejectedValue(semTreino);
    frequenciaService.registrarCheckin.mockResolvedValue({ id: 2 });

    const client = clienteFalso();
    client.loadObjects = jest.fn(async (object) => {
      if (object === 'access_logs') return [{ id: 11, time: Math.floor(Date.now() / 1000), event: 7, user_id: 778 }];
      return [];
    });
    catracasConfiguradas.mockReturnValue([client]);

    await expect(catracaService.processarNovosAcessos()).resolves.not.toThrow();
    expect(frequenciaService.registrarCheckin).toHaveBeenCalledWith(aluno.id, 'catraca');

    await limpar(aluno.id);
  });

  test('evento de usuário não reconhecido pelo TEG só vira telemetria, sem chamar sessão/frequência', async () => {
    const client = clienteFalso();
    client.loadObjects = jest.fn(async (object) => {
      if (object === 'access_logs') return [{ id: 12, time: Math.floor(Date.now() / 1000), event: 7, user_id: 999999 }];
      return [];
    });
    catracasConfiguradas.mockReturnValue([client]);

    await catracaService.processarNovosAcessos();

    expect(sessaoService.iniciarSessao).not.toHaveBeenCalled();
    expect(frequenciaService.registrarCheckin).not.toHaveBeenCalled();

    const { rows: [evento] } = await pool.query(
      `SELECT * FROM catraca_eventos WHERE catraca = 'catraca1' ORDER BY id DESC LIMIT 1`
    );
    expect(evento.usuario_id).toBeNull();

    await pool.query('DELETE FROM catraca_eventos WHERE id = $1', [evento.id]);
    await pool.query('DELETE FROM catraca_cursor WHERE catraca = $1', ['catraca1']);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && npm test -- catracaService.test.js`
Expected: FAIL — `processarNovosAcessos` não existe, e `jest.mock('./sessaoService')`/`'./frequenciaService'` reclamam de módulo inexistente se as Tasks 3/4 não tiverem sido feitas (confirme que já foram).

- [ ] **Step 3: Implementar**

Adicione no topo de `backend/src/services/catracaService.js`:

```js
const sessaoService = require('./sessaoService');
const frequenciaService = require('./frequenciaService');
```

E adicione antes do `module.exports`:

```js
function tipoDoEvento(event) {
  if (event === 7) return 'autorizado';
  if (event === 6) return 'negado';
  return 'nao_identificado';
}

async function processarEvento(client, evento) {
  const { rows: [mapeamento] } = await pool.query(
    'SELECT usuario_id FROM catraca_usuarios WHERE catraca = $1 AND catraca_user_id = $2',
    [client.nome, evento.user_id]
  );

  const tipo = tipoDoEvento(evento.event);
  await pool.query(
    `INSERT INTO catraca_eventos (usuario_id, catraca, tipo, criado_em) VALUES ($1, $2, $3, to_timestamp($4))`,
    [mapeamento?.usuario_id || null, client.nome, tipo, evento.time]
  );

  if (!mapeamento || tipo !== 'autorizado') return;

  try {
    await sessaoService.iniciarSessao(mapeamento.usuario_id, null, 'catraca');
  } catch {
    // Sem treino atribuído é esperado — só não ganha o auto-início de sessão.
  }

  await frequenciaService.registrarCheckin(mapeamento.usuario_id, 'catraca');
}

async function processarNovosAcessos() {
  for (const client of catracasConfiguradas()) {
    const { rows: [cursorRow] } = await pool.query(
      'SELECT ultimo_evento_id FROM catraca_cursor WHERE catraca = $1',
      [client.nome]
    );
    const cursor = cursorRow?.ultimo_evento_id || 0;

    const eventos = await client.loadObjects('access_logs', {
      fields: ['id', 'time', 'event', 'user_id'],
      where: { access_logs: { id: { '>': cursor } } },
      order: ['id', 'ascending'],
      limit: 200,
    });

    let maiorId = cursor;
    for (const evento of eventos) {
      maiorId = Math.max(maiorId, evento.id);
      await processarEvento(client, evento);
    }

    if (eventos.length) {
      await pool.query(
        `INSERT INTO catraca_cursor (catraca, ultimo_evento_id) VALUES ($1, $2)
         ON CONFLICT (catraca) DO UPDATE SET ultimo_evento_id = $2`,
        [client.nome, maiorId]
      );
    }
  }
}
```

Atualize o `module.exports` incluindo `processarNovosAcessos`.

- [ ] **Step 4: Rodar e ver passar**

Run: `cd backend && npm test -- catracaService.test.js`
Expected: PASS, 11 testes

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/catracaService.js backend/src/services/catracaService.test.js
git commit -m "feat(catraca): processarNovosAcessos lê access_logs e gera check-in"
```

---

### Task 9: `catracaService` — `verificarSaude` e `reconciliar`

**Files:**
- Modify: `backend/src/services/catracaService.js`
- Modify: `backend/src/services/catracaService.test.js`

**Interfaces:**
- Produces: `catracaService.verificarSaude()` → `Promise<Array<{ catraca, online }>>` (usado pela Task 12, rota de dashboard); `catracaService.reconciliar()` → `Promise<void>` (usado pela Task 10, job diário).

- [ ] **Step 1: Adicionar os testes**

No topo de `backend/src/services/catracaService.test.js`, troque a linha de import das fixtures por:

```js
const { criarUsuario, criarPlano, criarMatricula } = require('../testUtils/fixtures');
```

```js
describe('verificarSaude', () => {
  test('marca online quando login funciona e offline quando falha', async () => {
    const online = clienteFalso();
    online.nome = 'catraca1';
    const offline = clienteFalso();
    offline.nome = 'catraca2';
    offline.login = jest.fn().mockRejectedValue(new Error('timeout'));
    catracasConfiguradas.mockReturnValue([online, offline]);

    const resultado = await catracaService.verificarSaude();
    expect(resultado).toEqual([
      { catraca: 'catraca1', online: true },
      { catraca: 'catraca2', online: false },
    ]);
  });
});

describe('reconciliar', () => {
  async function limpar(usuarioId) {
    await pool.query('DELETE FROM catraca_usuarios WHERE usuario_id = $1', [usuarioId]);
    await pool.query('DELETE FROM usuarios WHERE id = $1', [usuarioId]);
  }

  test('re-sincroniza quando o usuário TEG sumiu da catraca (reset/exclusão manual)', async () => {
    const aluno = await criarUsuario({ nome: 'Aluno Reconciliar' });
    await pool.query(
      `INSERT INTO catraca_usuarios (usuario_id, catraca, catraca_user_id) VALUES ($1, 'catraca1', 888)`,
      [aluno.id]
    );

    const client = clienteFalso();
    client.loadObjects = jest.fn().mockResolvedValue([]); // usuário não existe mais na catraca
    catracasConfiguradas.mockReturnValue([client]);

    await catracaService.reconciliar();

    // sincronizarAluno recriou o mapeamento com um novo id (999, do mock padrão de createObjects)
    const { rows: [mapeamento] } = await pool.query(
      'SELECT catraca_user_id FROM catraca_usuarios WHERE usuario_id = $1 AND catraca = $2', [aluno.id, 'catraca1']
    );
    expect(mapeamento.catraca_user_id).toBe(999);

    await limpar(aluno.id);
  });

  test('não mexe em nada quando o usuário ainda existe na catraca', async () => {
    const aluno = await criarUsuario({ nome: 'Aluno Reconciliar OK' });
    await pool.query(
      `INSERT INTO catraca_usuarios (usuario_id, catraca, catraca_user_id) VALUES ($1, 'catraca1', 889)`,
      [aluno.id]
    );

    const client = clienteFalso();
    client.loadObjects = jest.fn(async (object) => (object === 'users' ? [{ id: 889 }] : []));
    catracasConfiguradas.mockReturnValue([client]);

    await catracaService.reconciliar();
    expect(client.createObjects).not.toHaveBeenCalledWith('users', expect.anything());

    await limpar(aluno.id);
  });

  test('corrige drift: libera quem tem matrícula ativa mas ficou fora do grupo (ex: bloquearAcesso/liberarAcesso falhou antes por rede)', async () => {
    const aluno = await criarUsuario({ nome: 'Aluno Drift Liberar' });
    const plano = await criarPlano();
    const matricula = await criarMatricula({ usuario_id: aluno.id, plano_id: plano.id, status: 'ativa' });
    await pool.query(
      `INSERT INTO catraca_usuarios (usuario_id, catraca, catraca_user_id, grupo_ativo) VALUES ($1, 'catraca1', 890, FALSE)`,
      [aluno.id]
    );

    const client = clienteFalso();
    client.loadObjects = jest.fn(async (object) => {
      if (object === 'users') return [{ id: 890 }];
      if (object === 'groups') return [{ id: 1, name: 'TEG-ativos' }];
      return [];
    });
    catracasConfiguradas.mockReturnValue([client]);

    await catracaService.reconciliar();

    const vinculoCriado = client.createObjects.mock.calls.find((c) => c[0] === 'user_groups');
    expect(vinculoCriado[1][0]).toEqual({ user_id: 890, group_id: 1 });

    await pool.query('DELETE FROM matriculas WHERE id = $1', [matricula.id]);
    await pool.query('DELETE FROM planos WHERE id = $1', [plano.id]);
    await limpar(aluno.id);
  });

  test('corrige drift: bloqueia quem não tem mais matrícula ativa mas ficou no grupo', async () => {
    const aluno = await criarUsuario({ nome: 'Aluno Drift Bloquear' });
    const plano = await criarPlano();
    const matricula = await criarMatricula({ usuario_id: aluno.id, plano_id: plano.id, status: 'suspensa' });
    await pool.query(
      `INSERT INTO catraca_usuarios (usuario_id, catraca, catraca_user_id, grupo_ativo) VALUES ($1, 'catraca1', 891, TRUE)`,
      [aluno.id]
    );

    const client = clienteFalso();
    client.loadObjects = jest.fn(async (object) => {
      if (object === 'users') return [{ id: 891 }];
      if (object === 'groups') return [{ id: 1, name: 'TEG-ativos' }];
      return [];
    });
    catracasConfiguradas.mockReturnValue([client]);

    await catracaService.reconciliar();

    expect(client.destroyObjects).toHaveBeenCalledWith('user_groups', { user_id: 891, group_id: 1 });

    await pool.query('DELETE FROM matriculas WHERE id = $1', [matricula.id]);
    await pool.query('DELETE FROM planos WHERE id = $1', [plano.id]);
    await limpar(aluno.id);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && npm test -- catracaService.test.js`
Expected: FAIL — `verificarSaude`/`reconciliar` não existem

- [ ] **Step 3: Implementar**

```js
async function verificarSaude() {
  const resultados = [];
  for (const client of catracasConfiguradas()) {
    try {
      await client.login();
      resultados.push({ catraca: client.nome, online: true });
    } catch {
      resultados.push({ catraca: client.nome, online: false });
    }
  }
  return resultados;
}

async function reconciliar() {
  for (const client of catracasConfiguradas()) {
    const { rows: mapeamentos } = await pool.query(
      `SELECT cu.usuario_id, cu.catraca_user_id, cu.grupo_ativo,
              EXISTS (SELECT 1 FROM matriculas m WHERE m.usuario_id = cu.usuario_id AND m.status = 'ativa') AS deveria_estar_ativo
       FROM catraca_usuarios cu WHERE cu.catraca = $1`,
      [client.nome]
    );

    for (const mapeamento of mapeamentos) {
      const encontrados = await client.loadObjects('users', {
        fields: ['id'],
        where: { users: { id: mapeamento.catraca_user_id } },
      });
      if (!encontrados.length) {
        // Usuário sumiu da catraca (reset de fábrica, exclusão manual etc.) — recria do zero.
        await pool.query(
          'DELETE FROM catraca_usuarios WHERE usuario_id = $1 AND catraca = $2',
          [mapeamento.usuario_id, client.nome]
        );
        await sincronizarAluno(mapeamento.usuario_id);
        if (mapeamento.deveria_estar_ativo) await liberarAcesso(mapeamento.usuario_id);
        continue;
      }

      // Corrige drift entre grupo_ativo e o status real da matrícula — cobre o
      // caso de liberarAcesso/bloquearAcesso ter falhado antes por rede e
      // nunca ter sido reprocessado (não há fila de retry pra esses dois).
      if (mapeamento.deveria_estar_ativo && !mapeamento.grupo_ativo) {
        await liberarAcesso(mapeamento.usuario_id);
      } else if (!mapeamento.deveria_estar_ativo && mapeamento.grupo_ativo) {
        await bloquearAcesso(mapeamento.usuario_id);
      }
    }
  }
}
```

Atualize o `module.exports` incluindo `verificarSaude` e `reconciliar`.

- [ ] **Step 4: Rodar e ver passar**

Run: `cd backend && npm test -- catracaService.test.js`
Expected: PASS, 14 testes

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/catracaService.js backend/src/services/catracaService.test.js
git commit -m "feat(catraca): verificarSaude (heartbeat) e reconciliar (drift diário)"
```

---

### Task 10: `configuracoes.catraca_ativa` no endpoint existente

**Files:**
- Modify: `backend/src/routes/configuracoes.js:17-35`
- Modify: `backend/src/routes/configuracoes.test.js`

**Interfaces:**
- Produces: `PATCH /api/configuracoes` aceita `catraca_ativa` (bool) — lido pelas Tasks 11/12 pra decidir se os ganchos/polling rodam.

- [ ] **Step 1: Adicionar o teste**

```js
test('dono consegue desligar catraca_ativa', async () => {
  const dono = await criarUsuario({ role: 'dono' });

  const res = await request(app)
    .patch('/api/configuracoes')
    .set('Authorization', `Bearer ${gerarToken(dono)}`)
    .send({ catraca_ativa: false });

  expect(res.status).toBe(200);
  expect(res.body.catraca_ativa).toBe(false);

  await pool.query('UPDATE configuracoes SET catraca_ativa = TRUE WHERE id = 1');
  await pool.query('DELETE FROM usuarios WHERE id = $1', [dono.id]);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && npm test -- configuracoes.test.js`
Expected: FAIL — `res.body.catraca_ativa` é `undefined` (coluna não é lida/gravada pelo PATCH ainda)

- [ ] **Step 3: Implementar**

Em `backend/src/routes/configuracoes.js`, troque o handler `PATCH /` por:

```js
router.patch('/', authMiddleware, requireRole('dono'), async (req, res, next) => {
  try {
    const { nome_academia, meta_faturamento_mensal, meta_novos_alunos_mensal, dias_tolerancia_bloqueio, catraca_ativa } = req.body;
    const { rows } = await pool.query(
      `UPDATE configuracoes SET
         nome_academia = COALESCE($1, nome_academia),
         meta_faturamento_mensal = COALESCE($2, meta_faturamento_mensal),
         meta_novos_alunos_mensal = COALESCE($3, meta_novos_alunos_mensal),
         dias_tolerancia_bloqueio = COALESCE($4, dias_tolerancia_bloqueio),
         catraca_ativa = COALESCE($5, catraca_ativa),
         updated_at = NOW()
       WHERE id = 1 RETURNING *`,
      [nome_academia, meta_faturamento_mensal, meta_novos_alunos_mensal, dias_tolerancia_bloqueio, catraca_ativa]
    );
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd backend && npm test -- configuracoes.test.js`
Expected: PASS, 2 testes

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/configuracoes.js backend/src/routes/configuracoes.test.js
git commit -m "feat(configuracoes): expõe catraca_ativa no PATCH existente"
```

---

### Task 11: Ganchos em `matriculas.js`, `pagamentos.js`, `webhooks.js`

**Files:**
- Modify: `backend/src/routes/matriculas.js:1-51`
- Modify: `backend/src/routes/pagamentos.js:1-85`
- Modify: `backend/src/routes/webhooks.js:1-38`
- Modify: `backend/src/routes/matriculas.test.js`
- Modify: `backend/src/routes/pagamentos.test.js`
- Modify: `backend/src/routes/webhooks.test.js`

**Interfaces:**
- Consumes: `catracaService.sincronizarAluno`, `catracaService.liberarAcesso` (Tasks 6, 7).

- [ ] **Step 1: Adicionar os testes (mockando `catracaService`)**

Em `backend/src/routes/matriculas.test.js`, adicione no topo:

```js
jest.mock('../services/catracaService');
const catracaService = require('../services/catracaService');
```

E adicione ao final do arquivo:

```js
describe('POST /api/matriculas — integração com a catraca', () => {
  test('sincroniza e libera acesso na catraca quando a matrícula é criada', async () => {
    catracaService.sincronizarAluno.mockResolvedValue(undefined);
    catracaService.liberarAcesso.mockResolvedValue(undefined);

    const aluno = await criarUsuario({ role: 'aluno' });
    const plano = await criarPlano({ nome: 'Plano Matricula Catraca Teste' });

    const res = await request(app)
      .post('/api/matriculas')
      .set('Authorization', `Bearer ${gerarToken(aluno)}`)
      .send({ plano_id: plano.id });

    expect(res.status).toBe(201);
    expect(catracaService.sincronizarAluno).toHaveBeenCalledWith(aluno.id);
    expect(catracaService.liberarAcesso).toHaveBeenCalledWith(aluno.id);

    await pool.query('DELETE FROM pagamentos WHERE usuario_id = $1', [aluno.id]);
    await pool.query('DELETE FROM matriculas WHERE usuario_id = $1', [aluno.id]);
    await pool.query('DELETE FROM planos WHERE id = $1', [plano.id]);
    await pool.query('DELETE FROM usuarios WHERE id = $1', [aluno.id]);
  });

  test('não falha a criação da matrícula quando a catraca está offline', async () => {
    catracaService.sincronizarAluno.mockRejectedValue(new Error('Catraca catraca1 inacessível'));
    catracaService.liberarAcesso.mockResolvedValue(undefined);

    const aluno = await criarUsuario({ role: 'aluno' });
    const plano = await criarPlano({ nome: 'Plano Matricula Catraca Offline Teste' });

    const res = await request(app)
      .post('/api/matriculas')
      .set('Authorization', `Bearer ${gerarToken(aluno)}`)
      .send({ plano_id: plano.id });

    expect(res.status).toBe(201);

    await pool.query('DELETE FROM pagamentos WHERE usuario_id = $1', [aluno.id]);
    await pool.query('DELETE FROM matriculas WHERE usuario_id = $1', [aluno.id]);
    await pool.query('DELETE FROM planos WHERE id = $1', [plano.id]);
    await pool.query('DELETE FROM usuarios WHERE id = $1', [aluno.id]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && npm test -- matriculas.test.js`
Expected: FAIL — `catracaService.sincronizarAluno` nunca é chamado

- [ ] **Step 3: Implementar o gancho em `matriculas.js`**

No topo de `backend/src/routes/matriculas.js`, adicione:

```js
const catracaService = require('../services/catracaService');
```

No handler `POST /` (depois do bloco de indicação convertida, antes do `res.status(201).json(matricula);`), adicione:

```js
    try {
      await catracaService.sincronizarAluno(req.user.id);
      await catracaService.liberarAcesso(req.user.id);
    } catch (err) {
      console.error(`[Catraca] falha ao sincronizar aluno ${req.user.id}:`, err.message);
    }

    res.status(201).json(matricula);
```

- [ ] **Step 4: Implementar os ganchos em `pagamentos.js` e `webhooks.js`**

Em `backend/src/routes/pagamentos.js`, adicione no topo:

```js
const catracaService = require('../services/catracaService');
```

Depois do `UPDATE matriculas SET status = 'ativa'...` no bloco de renovação automática (linha ~55-58 do arquivo original), adicione:

```js
      try {
        await catracaService.liberarAcesso(matricula.usuario_id);
      } catch (err) {
        console.error(`[Catraca] falha ao liberar acesso ${matricula.usuario_id}:`, err.message);
      }
```

E depois do bloco `if (matriculaAtivada)` (reativação manual pelo admin, linha ~67-78), dentro do `if`, adicione a mesma chamada usando `matriculaAtivada.usuario_id`.

Em `backend/src/routes/webhooks.js`, adicione no topo:

```js
const catracaService = require('../services/catracaService');
```

Depois do `if (status === 'pago') { await pool.query(...UPDATE matriculas SET status = 'ativa'...) }`, adicione:

```js
      try {
        await catracaService.liberarAcesso(pagamento.usuario_id);
      } catch (err) {
        console.error(`[Catraca] falha ao liberar acesso ${pagamento.usuario_id}:`, err.message);
      }
```

- [ ] **Step 5: Adicionar testes equivalentes em `pagamentos.test.js` e `webhooks.test.js`**

Siga o mesmo padrão do Step 1 (mock de `catracaService`, verificar chamada de `liberarAcesso` com o `usuario_id` certo) nos dois arquivos, reaproveitando os testes de confirmação de pagamento que já existem em `pagamentos.test.js` (o de renovação automática e o de ativação manual) e o teste de webhook de pagamento em `webhooks.test.js` (crie um pagamento/matrícula de fixture antes de simular o webhook, já que o teste atual só cobre o caso de gateway manual/404).

- [ ] **Step 6: Rodar toda a suíte afetada**

Run: `cd backend && npm test -- matriculas.test.js pagamentos.test.js webhooks.test.js`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add backend/src/routes/matriculas.js backend/src/routes/pagamentos.js backend/src/routes/webhooks.js \
  backend/src/routes/matriculas.test.js backend/src/routes/pagamentos.test.js backend/src/routes/webhooks.test.js
git commit -m "feat(catraca): sincroniza e libera acesso ao criar/reativar matrícula"
```

---

### Task 12: Ganchos no `jobWorker` — bloqueio automático + polling + reconciliação

**Files:**
- Modify: `backend/src/jobs/jobWorker.js`
- Modify: `backend/src/jobs/jobWorker.test.js`

**Interfaces:**
- Consumes: `catracaService.bloquearAcesso`, `catracaService.processarNovosAcessos`, `catracaService.reconciliar` (Tasks 7, 8, 9).

- [ ] **Step 1: Adicionar os testes**

No topo de `backend/src/jobs/jobWorker.test.js`, adicione:

```js
jest.mock('../services/catracaService');
const catracaService = require('../services/catracaService');
```

E adicione um novo `describe`:

```js
describe('processarVencimentos — bloqueio automático na catraca', () => {
  test('chama bloquearAcesso pra cada matrícula que vira suspensa', async () => {
    catracaService.bloquearAcesso.mockResolvedValue(undefined);

    const user = await criarUsuario();
    const plano = await criarPlano({ preco_mensal: 109.9, duracao_dias: 30 });
    const matricula = await criarMatricula({
      usuario_id: user.id, plano_id: plano.id, status: 'vencida',
      data_vencimento: new Date(Date.now() - 10 * 86400000),
    });
    await pool.query('UPDATE configuracoes SET dias_tolerancia_bloqueio = 5 WHERE id = 1');

    await processarVencimentos();

    expect(catracaService.bloquearAcesso).toHaveBeenCalledWith(user.id);

    await pool.query('DELETE FROM pagamentos WHERE matricula_id = $1', [matricula.id]);
    await pool.query('DELETE FROM matriculas WHERE id = $1', [matricula.id]);
    await pool.query('DELETE FROM usuarios WHERE id = $1', [user.id]);
    await pool.query('DELETE FROM planos WHERE id = $1', [plano.id]);
    await pool.query('UPDATE configuracoes SET dias_tolerancia_bloqueio = 5 WHERE id = 1');
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && npm test -- jobWorker.test.js`
Expected: FAIL — a fase 3 de `processarVencimentos` não retorna `usuario_id` nem chama `bloquearAcesso`

- [ ] **Step 3: Implementar o bloqueio automático**

Em `backend/src/jobs/jobWorker.js`, adicione no topo:

```js
const catracaService = require('../services/catracaService');
```

Troque o bloco da fase 3 (dentro de `processarVencimentos`, o `UPDATE matriculas SET status = 'suspensa'...`) por:

```js
  // 3. Vencidas além da tolerância configurada → suspensa
  const { rows: [{ dias_tolerancia_bloqueio, catraca_ativa }] } = await pool.query(
    'SELECT dias_tolerancia_bloqueio, catraca_ativa FROM configuracoes WHERE id = 1'
  );
  const { rows: suspensas } = await pool.query(
    `UPDATE matriculas SET status = 'suspensa', updated_at = NOW()
     WHERE status = 'vencida' AND data_vencimento::date <= CURRENT_DATE - $1::int
     RETURNING usuario_id`,
    [dias_tolerancia_bloqueio]
  );

  if (catraca_ativa) {
    for (const { usuario_id } of suspensas) {
      try {
        await catracaService.bloquearAcesso(usuario_id);
      } catch (err) {
        console.error(`[Catraca] falha ao bloquear acesso ${usuario_id}:`, err.message);
      }
    }
  }
```

- [ ] **Step 4: Rodar e ver passar**

Run: `cd backend && npm test -- jobWorker.test.js`
Expected: PASS (todos os testes existentes + o novo)

- [ ] **Step 5: Escrever o teste do polling de acessos + reconciliação**

Adicione:

```js
describe('startJobWorker — intervalos da catraca', () => {
  test('processarNovosAcessos e reconciliar são invocáveis independentemente do ciclo de 5min', async () => {
    catracaService.processarNovosAcessos.mockResolvedValue(undefined);
    catracaService.reconciliar.mockResolvedValue(undefined);

    const { processarNovosAcessosSeAtivo, reconciliarSeAtivo } = require('./jobWorker');
    await pool.query('UPDATE configuracoes SET catraca_ativa = TRUE WHERE id = 1');

    await processarNovosAcessosSeAtivo();
    expect(catracaService.processarNovosAcessos).toHaveBeenCalled();

    await reconciliarSeAtivo();
    expect(catracaService.reconciliar).toHaveBeenCalled();
  });

  test('não chama processarNovosAcessos nem reconciliar quando catraca_ativa é falso', async () => {
    catracaService.processarNovosAcessos.mockClear();
    catracaService.reconciliar.mockClear();
    await pool.query('UPDATE configuracoes SET catraca_ativa = FALSE WHERE id = 1');

    const { processarNovosAcessosSeAtivo, reconciliarSeAtivo } = require('./jobWorker');
    await processarNovosAcessosSeAtivo();
    await reconciliarSeAtivo();

    expect(catracaService.processarNovosAcessos).not.toHaveBeenCalled();
    expect(catracaService.reconciliar).not.toHaveBeenCalled();

    await pool.query('UPDATE configuracoes SET catraca_ativa = TRUE WHERE id = 1');
  });
});
```

- [ ] **Step 6: Rodar e ver falhar**

Run: `cd backend && npm test -- jobWorker.test.js`
Expected: FAIL — `processarNovosAcessosSeAtivo`/`reconciliarSeAtivo` não existem

- [ ] **Step 7: Implementar as funções guardadas por `catraca_ativa` e os dois intervalos**

Adicione em `backend/src/jobs/jobWorker.js`, antes de `startJobWorker`:

```js
async function catracaEstaAtiva() {
  const { rows: [{ catraca_ativa }] } = await pool.query('SELECT catraca_ativa FROM configuracoes WHERE id = 1');
  return catraca_ativa;
}

async function processarNovosAcessosSeAtivo() {
  if (!(await catracaEstaAtiva())) return;
  await catracaService.processarNovosAcessos();
}

async function reconciliarSeAtivo() {
  if (!(await catracaEstaAtiva())) return;
  await catracaService.reconciliar();
}
```

Troque `startJobWorker`:

```js
function startJobWorker() {
  setInterval(async () => {
    try {
      await processarVencimentos();
      await agendarAutomacoes();
      await executarJobsPendentes();
    } catch (err) {
      console.error('[JobWorker] erro:', err.message);
    }
  }, 5 * 60 * 1000); // a cada 5 minutos

  setInterval(async () => {
    try {
      await processarNovosAcessosSeAtivo();
    } catch (err) {
      console.error('[JobWorker] erro no polling da catraca:', err.message);
    }
  }, 45 * 1000); // a cada 45s — check-in precisa ser rápido

  setInterval(async () => {
    try {
      await reconciliarSeAtivo();
    } catch (err) {
      console.error('[JobWorker] erro na reconciliação da catraca:', err.message);
    }
  }, 24 * 60 * 60 * 1000); // 1x/dia

  console.log('⚙️  JobWorker iniciado');
}
```

E troque o `module.exports` final pra:

```js
module.exports = {
  startJobWorker, processarVencimentos, agendarAutomacoes, processarJob,
  processarNovosAcessosSeAtivo, reconciliarSeAtivo,
};
```

- [ ] **Step 8: Rodar e ver passar**

Run: `cd backend && npm test -- jobWorker.test.js`
Expected: PASS, todos os testes (antigos + novos)

- [ ] **Step 9: Commit**

```bash
git add backend/src/jobs/jobWorker.js backend/src/jobs/jobWorker.test.js
git commit -m "feat(catraca): bloqueio automático de suspensos + polling de acessos + reconciliação diária"
```

---

### Task 13: Rota `backend/src/routes/catraca.js` (status/dashboard + sync manual)

**Files:**
- Create: `backend/src/routes/catraca.js`
- Create: `backend/src/routes/catraca.test.js`
- Modify: `backend/src/server.js:29` (import) e `:104` (mount)

**Interfaces:**
- Consumes: `catracaService.verificarSaude`, `catracaService.sincronizarAluno` (Tasks 6, 9).
- Produces: `GET /api/catraca/status`, `POST /api/catraca/:usuarioId/sincronizar` — consumidos pelo frontend (Task 14).

- [ ] **Step 1: Escrever os testes**

```js
// backend/src/routes/catraca.test.js
jest.mock('../services/catracaService');
const request = require('supertest');
const app = require('../server');
const pool = require('../config/db');
const { criarUsuario, gerarToken } = require('../testUtils/fixtures');
const catracaService = require('../services/catracaService');

afterAll(async () => {
  await pool.end();
});

describe('GET /api/catraca/status', () => {
  test('rejeita aluno comum', async () => {
    const aluno = await criarUsuario({ role: 'aluno' });
    const res = await request(app)
      .get('/api/catraca/status')
      .set('Authorization', `Bearer ${gerarToken(aluno)}`);
    expect(res.status).toBe(403);
    await pool.query('DELETE FROM usuarios WHERE id = $1', [aluno.id]);
  });

  test('admin vê status das catracas e contagens', async () => {
    catracaService.verificarSaude.mockResolvedValue([
      { catraca: 'catraca1', online: true },
      { catraca: 'catraca2', online: false },
    ]);
    const admin = await criarUsuario({ role: 'admin' });

    const res = await request(app)
      .get('/api/catraca/status')
      .set('Authorization', `Bearer ${gerarToken(admin)}`);

    expect(res.status).toBe(200);
    expect(res.body.catracas).toEqual([
      { catraca: 'catraca1', online: true },
      { catraca: 'catraca2', online: false },
    ]);
    expect(res.body).toHaveProperty('sincronizados');
    expect(res.body).toHaveProperty('pendentes_presencial');
    expect(res.body).toHaveProperty('acessos_hoje');
    expect(res.body).toHaveProperty('grafico_acessos');
    expect(res.body).toHaveProperty('feed');

    await pool.query('DELETE FROM usuarios WHERE id = $1', [admin.id]);
  });
});

describe('POST /api/catraca/:usuarioId/sincronizar', () => {
  test('dispara sincronizarAluno e retorna ok', async () => {
    catracaService.sincronizarAluno.mockResolvedValue(undefined);
    const admin = await criarUsuario({ role: 'admin' });
    const aluno = await criarUsuario({ role: 'aluno' });

    const res = await request(app)
      .post(`/api/catraca/${aluno.id}/sincronizar`)
      .set('Authorization', `Bearer ${gerarToken(admin)}`);

    expect(res.status).toBe(200);
    expect(catracaService.sincronizarAluno).toHaveBeenCalledWith(aluno.id);

    await pool.query('DELETE FROM usuarios WHERE id = ANY($1)', [[admin.id, aluno.id]]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && npm test -- catraca.test.js`
Expected: FAIL — 404 (rota não montada ainda)

- [ ] **Step 3: Implementar a rota**

```js
// backend/src/routes/catraca.js
const express = require('express');
const pool = require('../config/db');
const { authMiddleware, requireRole } = require('../middleware/authMiddleware');
const catracaService = require('../services/catracaService');

const router = express.Router();

// GET /api/catraca/status (admin/dono) — dados pro dashboard
router.get('/status', authMiddleware, requireRole('admin', 'dono'), async (req, res, next) => {
  try {
    const catracas = await catracaService.verificarSaude();

    const { rows: [contagens] } = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE face_status = 'sincronizado')::int AS sincronizados,
        COUNT(*) FILTER (WHERE face_status = 'pendente_presencial')::int AS pendentes_presencial
      FROM catraca_usuarios
    `);

    const { rows: [{ total: acessos_hoje }] } = await pool.query(`
      SELECT COUNT(*)::int AS total FROM catraca_eventos
      WHERE tipo = 'autorizado' AND criado_em::date = CURRENT_DATE
    `);

    const { rows: grafico_acessos } = await pool.query(`
      SELECT date_trunc('hour', criado_em) AS hora, COUNT(*)::int AS total
      FROM catraca_eventos
      WHERE tipo = 'autorizado' AND criado_em >= NOW() - INTERVAL '3 days'
      GROUP BY hora ORDER BY hora
    `);

    const { rows: feed } = await pool.query(`
      SELECT ce.criado_em, ce.catraca, ce.tipo, u.nome
      FROM catraca_eventos ce LEFT JOIN usuarios u ON u.id = ce.usuario_id
      ORDER BY ce.criado_em DESC LIMIT 20
    `);

    res.json({
      catracas,
      sincronizados: contagens.sincronizados,
      pendentes_presencial: contagens.pendentes_presencial,
      acessos_hoje,
      grafico_acessos,
      feed,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/catraca/:usuarioId/sincronizar (admin/dono) — força re-sync manual
router.post('/:usuarioId/sincronizar', authMiddleware, requireRole('admin', 'dono'), async (req, res, next) => {
  try {
    await catracaService.sincronizarAluno(Number(req.params.usuarioId));
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
```

- [ ] **Step 4: Montar a rota em `server.js`**

Em `backend/src/server.js`, adicione o import perto dos outros (depois da linha `const webhooksRoutes = require('./routes/webhooks');`):

```js
const catracaRoutes = require('./routes/catraca');
```

E o mount depois de `app.use('/api/webhooks', webhooksRoutes);`:

```js
app.use('/api/catraca', catracaRoutes);
```

- [ ] **Step 5: Rodar e ver passar**

Run: `cd backend && npm test -- catraca.test.js`
Expected: PASS, 3 testes

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/catraca.js backend/src/routes/catraca.test.js backend/src/server.js
git commit -m "feat(catraca): rota de status/dashboard e sincronização manual"
```

---

### Task 14: Dashboard no admin (frontend)

**Files:**
- Create: `frontend/admin/catraca.html`
- Create: `frontend/assets/js/admin-catraca.js`
- Modify: sidebar de todas as páginas em `frontend/admin/*.html` (adiciona o link "Catraca")

**Interfaces:**
- Consumes: `GET /api/catraca/status` (Task 13), `api.get`/`api.post` (`frontend/assets/js/api.js`), `renderLineChart` (`frontend/assets/js/app-effects.js:163`), `animateNumber`/`formatMoeda` (mesmo padrão de `admin-dashboard.js`).

- [ ] **Step 1: Criar a página**

```html
<!-- frontend/admin/catraca.html -->
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  <title>Catraca - TEG Academia</title>
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
      <nav class="sidebar-nav">
        <a href="index.html" data-role-adminup><span data-icon="grid" data-icon-size="18"></span>Dashboard</a>
        <a href="financeiro.html" data-role-dono><span data-icon="wallet" data-icon-size="18"></span>Financeiro</a>
        <a href="alunos.html" data-role-adminup><span data-icon="users" data-icon-size="18"></span>Alunos</a>
        <a href="ranking.html"><span data-icon="award" data-icon-size="18"></span>Ranking</a>
        <a href="frequencia.html"><span data-icon="clock" data-icon-size="18"></span>Frequência</a>
        <a href="catraca.html" class="active" data-role-adminup><span data-icon="shield-check" data-icon-size="18"></span>Catraca</a>
        <a href="treinos.html"><span data-icon="dumbbell" data-icon-size="18"></span>Treinos</a>
        <a href="aulas.html" data-role-adminup><span data-icon="clipboard-list" data-icon-size="18"></span>Aulas</a>
        <a href="planos.html" data-role-adminup><span data-icon="package" data-icon-size="18"></span>Planos</a>
        <a href="crm.html" data-role-adminup><span data-icon="columns" data-icon-size="18"></span>CRM</a>
        <a href="pagamentos.html" data-role-adminup><span data-icon="credit-card" data-icon-size="18"></span>Pagamentos</a>
        <a href="equipe.html" data-role-dono><span data-icon="briefcase" data-icon-size="18"></span>Equipe</a>
        <a href="configuracoes.html" data-role-adminup><span data-icon="sliders" data-icon-size="18"></span>Configurações</a>
      </nav>
      <div class="sidebar-foot">
        <button type="button" id="btn-theme-toggle" data-theme-toggle class="btn btn-ghost btn-sm btn-block" data-icon="sun" data-icon-size="16" style="justify-content:flex-start;gap:0.7rem;padding:0.65rem 0.75rem;color:var(--color-muted)">Tema</button>
        <a href="#" id="btn-logout"><span data-icon="log-out" data-icon-size="18"></span>Sair</a>
      </div>
    </aside>

    <div class="main-content">
      <div class="page-head">
        <button class="btn btn-ghost btn-sm sidebar-toggle" id="btn-sidebar-toggle" data-icon="menu"></button>
        <div>
          <h1>Catraca</h1>
          <p>Controle de acesso das duas iDFace — sincronização, bloqueio automático e check-in.</p>
        </div>
      </div>

      <div class="grid grid-3" id="catraca-status-cards">
        <div class="loading-row" style="grid-column:1/-1"><span class="spinner"></span></div>
      </div>

      <div class="grid grid-4" id="catraca-cards" style="margin-top:1.5rem">
        <div class="loading-row" style="grid-column:1/-1"><span class="spinner"></span></div>
      </div>

      <div class="card" style="margin-top:1.5rem" data-reveal>
        <h3 style="margin-bottom:1rem">Acessos autorizados por hora (últimos 3 dias)</h3>
        <div id="catraca-grafico"></div>
      </div>

      <div class="table-wrap" style="margin-top:1.5rem" data-reveal>
        <table>
          <thead>
            <tr><th>Aluno</th><th>Catraca</th><th>Tipo</th><th>Horário</th></tr>
          </thead>
          <tbody id="catraca-feed-body">
            <tr><td colspan="4" class="loading-row"><span class="spinner"></span></td></tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <script src="../assets/js/icons.js"></script>
  <script src="../assets/js/api.js"></script>
  <script src="../assets/js/ui.js"></script>
  <script src="../assets/js/app-effects.js"></script>
  <script src="../assets/js/admin-guard.js"></script>
  <script src="../assets/js/admin-catraca.js"></script>
</body>
</html>
```

- [ ] **Step 2: Criar o JS da página**

```js
// frontend/assets/js/admin-catraca.js
function formatarData(iso) {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function renderStatusCatracas(catracas) {
  const container = document.getElementById('catraca-status-cards');
  container.innerHTML = catracas.map((c) => `
    <div class="card stat-card" data-reveal>
      <span class="stat-icon" style="color:${c.online ? 'var(--color-success)' : 'var(--color-danger)'}">
        ${Icons.icon(c.online ? 'shield-check' : 'shield', { size: 20 })}
      </span>
      <strong>${c.online ? 'Online' : 'Offline'}</strong>
      <span>${c.catraca}</span>
    </div>
  `).join('');
}

async function carregarCatraca() {
  try {
    const d = await api.get('/api/catraca/status');

    renderStatusCatracas(d.catracas);

    const cardsContainer = document.getElementById('catraca-cards');
    cardsContainer.innerHTML = `
      <div class="card stat-card" data-reveal><span class="stat-icon">${Icons.icon('users', { size: 20 })}</span><strong>${d.sincronizados}</strong><span>Alunos sincronizados</span></div>
      <div class="card stat-card" data-reveal><span class="stat-icon">${Icons.icon('clock', { size: 20 })}</span><strong>${d.pendentes_presencial}</strong><span>Rostos pendentes (cadastro presencial)</span></div>
      <div class="card stat-card" data-reveal><span class="stat-icon">${Icons.icon('shield-check', { size: 20 })}</span><strong>${d.acessos_hoje}</strong><span>Acessos autorizados hoje</span></div>
    `;
    initReveal();

    renderLineChart('catraca-grafico', d.grafico_acessos.map((g) => ({
      label: new Date(g.hora).toLocaleString('pt-BR', { day: '2-digit', hour: '2-digit' }),
      valor: Number(g.total),
    })));

    const feedBody = document.getElementById('catraca-feed-body');
    if (!d.feed.length) {
      feedBody.innerHTML = '<tr><td colspan="4" class="empty-state">Nenhum acesso registrado ainda.</td></tr>';
    } else {
      feedBody.innerHTML = d.feed.map((f) => `
        <tr>
          <td>${f.nome || 'Não identificado'}</td>
          <td>${f.catraca}</td>
          <td>${f.tipo}</td>
          <td>${formatarData(f.criado_em)}</td>
        </tr>
      `).join('');
    }
  } catch (err) {
    document.getElementById('catraca-status-cards').innerHTML = '<div class="empty-state" style="grid-column:1/-1">Não foi possível carregar os dados.</div>';
  }
}

carregarCatraca();
```

- [ ] **Step 3: Adicionar o link "Catraca" na sidebar das outras páginas admin**

Em cada um dos arquivos `frontend/admin/index.html`, `financeiro.html`, `alunos.html`, `ranking.html`, `frequencia.html`, `treinos.html`, `aulas.html`, `planos.html`, `crm.html`, `pagamentos.html`, `equipe.html`, `configuracoes.html`, adicione a linha abaixo logo depois do link `frequencia.html` (mesma posição usada em `catraca.html` acima), sem `class="active"`:

```html
<a href="catraca.html" data-role-adminup><span data-icon="shield-check" data-icon-size="18"></span>Catraca</a>
```

- [ ] **Step 4: Testar manualmente no navegador**

Suba o backend (`cd backend && npm run dev`) e sirva o frontend localmente (ex: `npx serve frontend` ou a extensão Live Server), logue como `admin`/`dono`, abra `admin/catraca.html` e confirme que:
- Os cards de status aparecem (mesmo que "Offline" se as env vars das catracas não estiverem configuradas localmente).
- O gráfico mostra "Sem dados registrados ainda" quando não há `catraca_eventos`.
- O link "Catraca" aparece nas outras páginas do admin e navega corretamente.

- [ ] **Step 5: Commit**

```bash
git add frontend/admin/catraca.html frontend/assets/js/admin-catraca.js frontend/admin/*.html
git commit -m "feat(catraca): dashboard no admin espelhando o visual da iDFace"
```

---

### Task 15: Rodar a suíte inteira e conferir o ponto de partida do rollout

**Files:** nenhum arquivo novo — task de verificação.

- [ ] **Step 1: Rodar toda a suíte de testes do backend**

Run: `cd backend && npm test`
Expected: PASS, nenhuma regressão nos testes que já existiam antes desta entrega

- [ ] **Step 2: Conferir a lista de variáveis de ambiente necessárias em produção**

Confirme no Railway (produção) que existem: `CATRACA1_HOST`, `CATRACA1_PORT`, `CATRACA1_USER`, `CATRACA1_PASSWORD`, `CATRACA2_HOST`, `CATRACA2_PORT`, `CATRACA2_USER`, `CATRACA2_PASSWORD`. Sem elas, `catracasConfiguradas()` retorna array vazio e toda a integração vira no-op silencioso (comportamento seguro por padrão).

- [ ] **Step 3: Commit final se sobrou algo pendente**

```bash
git status
```

Se tudo já foi commitado nas tasks anteriores, não há o que fazer aqui.

---

### Task 16 (manual, fora de CI): Rollout gradual contra o hardware real

Esta task não tem código — é o checklist operacional combinado no design (rollout em duas etapas, seção "Escopo de sincronização" do spec).

- [ ] Rodar `POST /api/catraca/:usuarioId/sincronizar` pra 2-3 contas de teste (Matias + outros) com `CATRACA1_*`/`CATRACA2_*` apontando pras catracas reais.
- [ ] Conferir nas telas das duas iDFace (Cadastrar → Usuários) que os `TEG-<id>` apareceram, sem sumir nenhum dos ~4796 do CloudGym.
- [ ] Testar reconhecimento facial ao vivo com uma dessas contas de teste (se a foto foi aceita) ou cadastrar o rosto manualmente na recepção pra quem ficou `pendente_presencial`.
- [ ] Confirmar que o check-in aparece em `GET /api/frequencias/minha` e em `catraca_eventos` minutos depois de passar na catraca.
- [ ] Só depois disso, rodar o sync pros ~1000 alunos com `matriculas.status = 'ativa'` (endpoint de sync manual em loop, ou um script avulso reaproveitando `catracaService.sincronizarAluno` — decidir na hora conforme volume observado no teste).
- [ ] Monitorar RAM/estabilidade das duas iDFace depois do sync completo (já estavam em 87% antes desta entrega).
