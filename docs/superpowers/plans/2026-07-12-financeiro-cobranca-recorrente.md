# Financeiro / Cobrança Recorrente — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatizar o ciclo de cobrança da matrícula (hoje 100% manual) com um adapter de gateway plugável, mantendo o pagamento fora do site (WhatsApp/recepção) e bloqueando gradualmente o acesso do aluno inadimplente sem tocar na conta de login.

**Architecture:** Camada de adapter (`backend/src/services/gateway/`) isola qualquer gateway de pagamento futuro atrás de uma interface fixa; o `jobWorker.js` existente (fila `jobs` + polling a cada 5min) ganha a lógica de gerar a próxima cobrança no vencimento e agendar lembretes; confirmação de pagamento (manual hoje, webhook amanhã) é o único ponto que estende `matriculas.data_vencimento`.

**Tech Stack:** Node.js/Express, PostgreSQL (`pg`), Jest + Supertest, JavaScript puro no frontend (sem framework/build step).

## Global Constraints

- Spec de referência: `docs/superpowers/specs/2026-07-12-financeiro-cobranca-recorrente-design.md`
- Single-tenant (uma academia só) — sem split de pagamento, sem multi-tenant.
- Sem checkout/página de pagamento própria — link de pagamento é repassado só pelo WhatsApp ou tratado na recepção.
- Conta de login (`usuarios.ativo`) e matrícula/cobrança (`matriculas.status`) são eixos independentes — nenhuma task deve desativar a conta do aluno por causa de atraso de pagamento.
- `PAYMENT_GATEWAY` (env var) seleciona o adapter ativo; default `manual` (nenhuma chamada externa, fluxo idêntico ao atual).
- Tasks 1 e 5–10 fazem query real em Postgres e exigem `backend/.env` com `DATABASE_URL` apontando pra um Postgres com o schema `academia_test` criado (`CREATE SCHEMA IF NOT EXISTS academia_test;`) e migrado (`NODE_ENV=test node run-migrations.js` a partir de `backend/`, depois de rodar a migration da Task 1). Sem isso, essas tasks só podem ser validadas por leitura de código, não por `npm test`.
- Tasks 2, 3 e 4 não tocam banco (adapter puro, rota 404 do webhook manual, mensagens de WhatsApp mockadas) — dá pra rodar `npm test` mesmo sem `.env` configurado.

---

### Task 1: Migration — colunas de cobrança recorrente

**Files:**
- Create: `database/migrations/022_financeiro_cobranca_recorrente.sql`
- Test: `backend/src/config/schema.test.js`

**Interfaces:**
- Produces: colunas `pagamentos.gateway`, `pagamentos.gateway_charge_id`, `pagamentos.link_pagamento`, `pagamentos.tentativa`, `pagamentos.gerado_automaticamente`; coluna `configuracoes.dias_tolerancia_bloqueio` (default 5); `automacoes_log.tipo` aceita `'atraso'`.

- [ ] **Step 1: Escrever a migration**

```sql
-- Cobrança recorrente: adapter de gateway plugável (ver
-- backend/src/services/gateway/) e bloqueio gradual por inadimplência.
-- gerado_automaticamente distingue o pagamento de renovação criado pelo
-- jobWorker (que ao ser confirmado estende data_vencimento) dos pagamentos
-- de matrícula inicial ou renovação manual pelo admin (que já estendem
-- data_vencimento na hora, ver PATCH /admin/matriculas/:id/renovar).
ALTER TABLE pagamentos
  ADD COLUMN gateway VARCHAR(30),
  ADD COLUMN gateway_charge_id VARCHAR(100),
  ADD COLUMN link_pagamento TEXT,
  ADD COLUMN tentativa INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN gerado_automaticamente BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX idx_pagamentos_gateway_charge_id ON pagamentos(gateway_charge_id) WHERE gateway_charge_id IS NOT NULL;

ALTER TABLE configuracoes
  ADD COLUMN dias_tolerancia_bloqueio INTEGER NOT NULL DEFAULT 5;

ALTER TABLE automacoes_log DROP CONSTRAINT automacoes_log_tipo_check;
ALTER TABLE automacoes_log ADD CONSTRAINT automacoes_log_tipo_check
  CHECK (tipo IN ('ausencia', 'vencimento', 'aniversario', 'boas_vindas', 'indicacao_convertida', 'atraso'));
```

Salve em `database/migrations/022_financeiro_cobranca_recorrente.sql`.

- [ ] **Step 2: Escrever o teste (falhando, pois a migration ainda não rodou no schema de teste)**

```javascript
// backend/src/config/schema.test.js
const pool = require('./db');

describe('migration 022 — colunas de cobrança recorrente', () => {
  afterAll(async () => {
    await pool.end();
  });

  test('pagamentos tem as colunas novas', async () => {
    const { rows } = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'pagamentos' AND table_schema = current_schema()
    `);
    const colunas = rows.map((r) => r.column_name);
    expect(colunas).toEqual(expect.arrayContaining([
      'gateway', 'gateway_charge_id', 'link_pagamento', 'tentativa', 'gerado_automaticamente',
    ]));
  });

  test('configuracoes tem dias_tolerancia_bloqueio com default 5', async () => {
    const { rows: [cfg] } = await pool.query('SELECT dias_tolerancia_bloqueio FROM configuracoes WHERE id = 1');
    expect(cfg.dias_tolerancia_bloqueio).toBe(5);
  });

  test('automacoes_log aceita tipo atraso', async () => {
    await expect(pool.query(
      `INSERT INTO automacoes_log (tipo, mensagem, status) VALUES ('atraso', 'teste', 'enviado')`
    )).resolves.toBeDefined();
    await pool.query(`DELETE FROM automacoes_log WHERE tipo = 'atraso' AND mensagem = 'teste'`);
  });
});
```

- [ ] **Step 3: Rodar o teste pra confirmar que falha**

Run (dentro de `backend/`, com `.env` configurado): `NODE_ENV=test npx jest src/config/schema.test.js`
Expected: FAIL — colunas/constraint ainda não existem no schema `academia_test`.

- [ ] **Step 4: Aplicar a migration no schema de teste e rodar de novo**

Run: `NODE_ENV=test node run-migrations.js`
Run: `NODE_ENV=test npx jest src/config/schema.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add database/migrations/022_financeiro_cobranca_recorrente.sql backend/src/config/schema.test.js
git commit -m "feat(db): adiciona colunas de cobrança recorrente e bloqueio gradual"
```

---

### Task 2: Adapter de gateway de pagamento

**Files:**
- Create: `backend/src/services/gateway/gatewayAdapter.js`
- Create: `backend/src/services/gateway/manualAdapter.js`
- Create: `backend/src/services/gateway/index.js`
- Test: `backend/src/services/gateway/gateway.test.js`

**Interfaces:**
- Produces: `getGatewayAdapter()` → objeto com `{ suportaWebhook: boolean, criarCobranca({ valor, vencimento, usuario }) => Promise<{ gateway_charge_id: string|null, link_pagamento: string|null }>, processarWebhook(payload) => Promise<{ gateway_charge_id: string, status: 'pago'|'cancelado' }> }`. Usado pelas Tasks 3 e 5.

- [ ] **Step 1: Escrever o teste (falhando)**

```javascript
// backend/src/services/gateway/gateway.test.js
const { getGatewayAdapter } = require('./index');
const manualAdapter = require('./manualAdapter');

describe('getGatewayAdapter', () => {
  const originalEnv = process.env.PAYMENT_GATEWAY;
  afterEach(() => {
    process.env.PAYMENT_GATEWAY = originalEnv;
  });

  test('retorna o adapter manual por padrão quando PAYMENT_GATEWAY não definido', () => {
    delete process.env.PAYMENT_GATEWAY;
    expect(getGatewayAdapter()).toBe(manualAdapter);
  });

  test('lança erro para gateway desconhecido', () => {
    process.env.PAYMENT_GATEWAY = 'inexistente';
    expect(() => getGatewayAdapter()).toThrow('Gateway de pagamento desconhecido: inexistente');
  });
});

describe('manualAdapter', () => {
  test('não suporta webhook', () => {
    expect(manualAdapter.suportaWebhook).toBe(false);
  });

  test('criarCobranca retorna sem link nem id (fluxo manual/recepção)', async () => {
    const resultado = await manualAdapter.criarCobranca({
      valor: 109.9,
      vencimento: new Date(),
      usuario: { id: 1, telefone: '67999999999' },
    });
    expect(resultado).toEqual({ gateway_charge_id: null, link_pagamento: null });
  });

  test('processarWebhook rejeita (adapter manual não recebe webhook)', async () => {
    await expect(manualAdapter.processarWebhook({})).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Rodar o teste pra confirmar que falha**

Run: `cd backend && npx jest src/services/gateway/gateway.test.js`
Expected: FAIL com "Cannot find module './index'"

- [ ] **Step 3: Implementar `gatewayAdapter.js`**

```javascript
// backend/src/services/gateway/gatewayAdapter.js
// Contrato que qualquer adapter de gateway de pagamento precisa implementar:
//   suportaWebhook: boolean
//   criarCobranca({ valor, vencimento, usuario }) => Promise<{ gateway_charge_id, link_pagamento }>
//   processarWebhook(payload) => Promise<{ gateway_charge_id, status: 'pago'|'cancelado' }>
const METODOS_OBRIGATORIOS = ['criarCobranca', 'processarWebhook'];

function assertGatewayAdapter(adapter) {
  for (const metodo of METODOS_OBRIGATORIOS) {
    if (typeof adapter[metodo] !== 'function') {
      throw new Error(`Adapter de gateway inválido: falta o método "${metodo}"`);
    }
  }
  return adapter;
}

module.exports = { assertGatewayAdapter };
```

- [ ] **Step 4: Implementar `manualAdapter.js`**

```javascript
// backend/src/services/gateway/manualAdapter.js
// Adapter ativo por padrão: nenhuma chamada externa, pagamento fica
// pendente sem link — confirmado à mão pelo admin, igual ao fluxo atual.
const manualAdapter = {
  suportaWebhook: false,

  async criarCobranca({ valor, vencimento, usuario }) {
    return { gateway_charge_id: null, link_pagamento: null };
  },

  async processarWebhook(payload) {
    throw new Error('Adapter manual não recebe webhook');
  },
};

module.exports = manualAdapter;
```

- [ ] **Step 5: Implementar `index.js`**

```javascript
// backend/src/services/gateway/index.js
const { assertGatewayAdapter } = require('./gatewayAdapter');
const manualAdapter = require('./manualAdapter');

// Trocar de gateway = implementar um novo <nome>Adapter.js com o mesmo
// contrato de gatewayAdapter.js, registrar aqui, e mudar a env var.
const ADAPTERS = {
  manual: manualAdapter,
};

function getGatewayAdapter() {
  const nome = process.env.PAYMENT_GATEWAY || 'manual';
  const adapter = ADAPTERS[nome];
  if (!adapter) throw new Error(`Gateway de pagamento desconhecido: ${nome}`);
  return assertGatewayAdapter(adapter);
}

module.exports = { getGatewayAdapter };
```

- [ ] **Step 6: Rodar o teste pra confirmar que passa**

Run: `cd backend && npx jest src/services/gateway/gateway.test.js`
Expected: PASS (5 testes)

- [ ] **Step 7: Commit**

```bash
git add backend/src/services/gateway/
git commit -m "feat(financeiro): adapter de gateway de pagamento plugável (manual por padrão)"
```

---

### Task 3: Rota de webhook de pagamento

**Files:**
- Create: `backend/src/routes/webhooks.js`
- Modify: `backend/src/server.js` (registrar rota)
- Test: `backend/src/routes/webhooks.test.js`

**Interfaces:**
- Consumes: `getGatewayAdapter()` de `../services/gateway` (Task 2).
- Produces: `POST /api/webhooks/pagamento` — 404 quando o adapter ativo não suporta webhook (hoje sempre, com o manual).

- [ ] **Step 1: Escrever o teste (falhando)**

```javascript
// backend/src/routes/webhooks.test.js
const request = require('supertest');
const app = require('../server');

describe('POST /api/webhooks/pagamento', () => {
  const originalGateway = process.env.PAYMENT_GATEWAY;
  afterEach(() => {
    process.env.PAYMENT_GATEWAY = originalGateway;
  });

  test('retorna 404 quando o gateway ativo (manual) não suporta webhook', async () => {
    delete process.env.PAYMENT_GATEWAY;
    const res = await request(app).post('/api/webhooks/pagamento').send({});
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/não recebe webhook/);
  });
});
```

- [ ] **Step 2: Rodar o teste pra confirmar que falha**

Run: `cd backend && npx jest src/routes/webhooks.test.js`
Expected: FAIL com 404 de rota inexistente (Express retorna HTML de erro, não o JSON esperado) ou erro de módulo não encontrado, dependendo da ordem de implementação — a asserção `res.body.error` falha porque a rota ainda não existe.

- [ ] **Step 3: Implementar a rota**

```javascript
// backend/src/routes/webhooks.js
const express = require('express');
const pool = require('../config/db');
const { getGatewayAdapter } = require('../services/gateway');

const router = express.Router();

// POST /api/webhooks/pagamento — recebido do gateway configurado via PAYMENT_GATEWAY.
// Inerte (404) enquanto o gateway ativo for o manual.
router.post('/pagamento', async (req, res, next) => {
  try {
    const adapter = getGatewayAdapter();
    if (!adapter.suportaWebhook) {
      return res.status(404).json({ error: 'Gateway atual não recebe webhook' });
    }

    const { gateway_charge_id, status } = await adapter.processarWebhook(req.body);

    const { rows: [pagamento] } = await pool.query(
      `UPDATE pagamentos SET status = $1, data_pagamento = CASE WHEN $1 = 'pago' THEN NOW() ELSE data_pagamento END
       WHERE gateway_charge_id = $2 RETURNING *`,
      [status, gateway_charge_id]
    );
    if (!pagamento) return res.status(404).json({ error: 'Cobrança não encontrada' });

    if (status === 'pago') {
      await pool.query(
        `UPDATE matriculas SET status = 'ativa', updated_at = NOW() WHERE id = $1`,
        [pagamento.matricula_id]
      );
    }

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
```

- [ ] **Step 4: Registrar a rota em `server.js`**

Em `backend/src/server.js:22`, logo após a linha `const equipeRoutes = require('./routes/equipe');`, adicione:

```javascript
const webhooksRoutes = require('./routes/webhooks');
```

Em `backend/src/server.js:80`, logo após `app.use('/api/equipe', equipeRoutes);`, adicione:

```javascript
app.use('/api/webhooks', webhooksRoutes);
```

- [ ] **Step 5: Rodar o teste pra confirmar que passa**

Run: `cd backend && npx jest src/routes/webhooks.test.js`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/webhooks.js backend/src/routes/webhooks.test.js backend/src/server.js
git commit -m "feat(financeiro): rota de webhook de pagamento (inerte com adapter manual)"
```

---

### Task 4: Mensagens de WhatsApp — cobrança gerada e atraso

**Files:**
- Modify: `backend/src/services/whatsappService.js`
- Test: `backend/src/services/whatsappService.test.js`

**Interfaces:**
- Produces: `enviarCobrancaGerada(telefone, nome, linkPagamento)`, `enviarLembreteAtraso(telefone, nome, diasAtraso)`. Usados pela Task 6.

- [ ] **Step 1: Escrever o teste (falhando)**

```javascript
// backend/src/services/whatsappService.test.js
const whatsappService = require('./whatsappService');

describe('whatsappService — cobrança e atraso', () => {
  let consoleSpy;
  beforeEach(() => {
    consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => {
    consoleSpy.mockRestore();
  });

  test('enviarCobrancaGerada inclui o link quando fornecido', async () => {
    await whatsappService.enviarCobrancaGerada('67999999999', 'Maria', 'https://pay.example.com/abc');
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('https://pay.example.com/abc'));
  });

  test('enviarCobrancaGerada avisa pra procurar a recepção quando não há link', async () => {
    await whatsappService.enviarCobrancaGerada('67999999999', 'Maria', null);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('recepção'));
  });

  test('enviarLembreteAtraso menciona os dias de atraso', async () => {
    await whatsappService.enviarLembreteAtraso('67999999999', 'Maria', 3);
    expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('3 dia'));
  });
});
```

- [ ] **Step 2: Rodar o teste pra confirmar que falha**

Run: `cd backend && npx jest src/services/whatsappService.test.js`
Expected: FAIL — `whatsappService.enviarCobrancaGerada is not a function`

- [ ] **Step 3: Implementar as funções**

Em `backend/src/services/whatsappService.js`, adicione antes de `module.exports` (linha 42):

```javascript
async function enviarCobrancaGerada(telefone, nome, linkPagamento) {
  await enviar(telefone,
    linkPagamento
      ? `Olá ${nome}! 💳\nSua próxima cobrança já está disponível:\n${linkPagamento}\n\nPague para continuar treinando sem interrupção!`
      : `Olá ${nome}! 💳\nSua próxima cobrança foi gerada. Procure a recepção da academia para regularizar.`
  );
}

async function enviarLembreteAtraso(telefone, nome, diasAtraso) {
  await enviar(telefone,
    `Olá ${nome}! ⚠️\nSeu pagamento está atrasado há *${diasAtraso} dia(s)*.\n` +
    `Regularize o quanto antes para não perder o acesso aos treinos e aulas.`
  );
}
```

E atualize o `module.exports` (linha 42-48) para:

```javascript
module.exports = {
  enviar,
  enviarBoasVindas,
  enviarLembreteAusencia,
  enviarLembreteVencimento,
  enviarPaizens,
  enviarCobrancaGerada,
  enviarLembreteAtraso,
};
```

- [ ] **Step 4: Rodar o teste pra confirmar que passa**

Run: `cd backend && npx jest src/services/whatsappService.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/whatsappService.js backend/src/services/whatsappService.test.js
git commit -m "feat(financeiro): mensagens de WhatsApp pra cobrança gerada e atraso"
```

---

### Task 5: Fixtures de teste compartilhadas

**Files:**
- Create: `backend/src/testUtils/fixtures.js`

**Interfaces:**
- Produces: `criarUsuario(overrides)` → INSERT em `usuarios`, retorna a linha; `criarPlano(overrides)` → INSERT em `planos`, retorna a linha; `criarMatricula(overrides)` → INSERT em `matriculas`, retorna a linha; `gerarToken(user)` → JWT válido pro `authMiddleware`. Usado pelas Tasks 6, 7, 8, 9, 10.

Esta task não tem lógica de negócio pra testar isoladamente (é infraestrutura de teste); a validação dela acontece indiretamente quando as Tasks 6+ a usam com sucesso. Ainda assim, escrevemos um teste de sanidade.

- [ ] **Step 1: Escrever o teste de sanidade (falhando)**

```javascript
// backend/src/testUtils/fixtures.test.js
const pool = require('../config/db');
const { criarUsuario, criarPlano, criarMatricula, gerarToken } = require('./fixtures');

describe('fixtures de teste', () => {
  afterAll(async () => {
    await pool.end();
  });

  test('criarUsuario insere um aluno ativo e retorna a linha', async () => {
    const user = await criarUsuario({ role: 'aluno' });
    expect(user.id).toBeDefined();
    expect(user.role).toBe('aluno');
    expect(user.ativo).toBe(true);
    await pool.query('DELETE FROM usuarios WHERE id = $1', [user.id]);
  });

  test('criarPlano insere um plano ativo', async () => {
    const plano = await criarPlano({ preco_mensal: 99.9, duracao_dias: 30 });
    expect(plano.preco_mensal).toBe('99.90');
    await pool.query('DELETE FROM planos WHERE id = $1', [plano.id]);
  });

  test('criarMatricula vincula usuario e plano', async () => {
    const user = await criarUsuario();
    const plano = await criarPlano();
    const matricula = await criarMatricula({ usuario_id: user.id, plano_id: plano.id, status: 'ativa' });
    expect(matricula.usuario_id).toBe(user.id);
    await pool.query('DELETE FROM matriculas WHERE id = $1', [matricula.id]);
    await pool.query('DELETE FROM usuarios WHERE id = $1', [user.id]);
    await pool.query('DELETE FROM planos WHERE id = $1', [plano.id]);
  });

  test('gerarToken produz um JWT decodificável', () => {
    const token = gerarToken({ id: 42, role: 'aluno', senha_alterada_em: null });
    expect(typeof token).toBe('string');
    expect(token.split('.')).toHaveLength(3);
  });
});
```

- [ ] **Step 2: Rodar o teste pra confirmar que falha**

Run: `cd backend && NODE_ENV=test npx jest src/testUtils/fixtures.test.js`
Expected: FAIL — `Cannot find module './fixtures'`

- [ ] **Step 3: Implementar as fixtures**

```javascript
// backend/src/testUtils/fixtures.js
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const pool = require('../config/db');

let contador = 0;
function unico() {
  contador += 1;
  return `${Date.now()}_${contador}`;
}

async function criarUsuario(overrides = {}) {
  const senha_hash = await bcrypt.hash('senha1234', 4);
  const { rows: [user] } = await pool.query(
    `INSERT INTO usuarios (nome, email, senha_hash, telefone, role)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [
      overrides.nome || 'Aluno Teste',
      overrides.email || `${unico()}@teste.com`,
      senha_hash,
      overrides.telefone || '67999999999',
      overrides.role || 'aluno',
    ]
  );
  return user;
}

async function criarPlano(overrides = {}) {
  const { rows: [plano] } = await pool.query(
    `INSERT INTO planos (nome, descricao, preco_mensal, duracao_dias)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [
      overrides.nome || `Plano Teste ${unico()}`,
      overrides.descricao || 'Plano de teste',
      overrides.preco_mensal || 109.9,
      overrides.duracao_dias || 30,
    ]
  );
  return plano;
}

async function criarMatricula(overrides) {
  const { rows: [matricula] } = await pool.query(
    `INSERT INTO matriculas (usuario_id, plano_id, data_vencimento, status)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [
      overrides.usuario_id,
      overrides.plano_id,
      overrides.data_vencimento || new Date(Date.now() + 30 * 86400000),
      overrides.status || 'ativa',
    ]
  );
  return matricula;
}

function gerarToken(user) {
  const pwdTs = user.senha_alterada_em
    ? Math.floor(new Date(user.senha_alterada_em).getTime() / 1000)
    : 0;
  return jwt.sign({ id: user.id, role: user.role, pwdTs }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

module.exports = { criarUsuario, criarPlano, criarMatricula, gerarToken };
```

- [ ] **Step 4: Rodar o teste pra confirmar que passa**

Run: `cd backend && NODE_ENV=test npx jest src/testUtils/fixtures.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add backend/src/testUtils/
git commit -m "test: fixtures compartilhadas pra testes de integração com Postgres"
```

---

### Task 6: jobWorker — geração automática da próxima cobrança + transições de estado

**Files:**
- Modify: `backend/src/jobs/jobWorker.js`
- Test: `backend/src/jobs/jobWorker.test.js`

**Interfaces:**
- Consumes: `getGatewayAdapter()` (Task 2); `criarUsuario`, `criarPlano`, `criarMatricula` (Task 5).
- Produces: `processarVencimentos()` exportado — gera cobrança pro próximo ciclo no vencimento, marca `vencida` após o vencimento e `suspensa` após `dias_tolerancia_bloqueio`. Consumido pela Task 7 (via `agendarAutomacoes`) e usável isoladamente pelos testes.

- [ ] **Step 1: Escrever o teste (falhando)**

```javascript
// backend/src/jobs/jobWorker.test.js
const pool = require('../config/db');
const { criarUsuario, criarPlano, criarMatricula } = require('../testUtils/fixtures');
const { processarVencimentos } = require('./jobWorker');

describe('processarVencimentos', () => {
  afterAll(async () => {
    await pool.end();
  });

  async function limpar(ids) {
    await pool.query('DELETE FROM pagamentos WHERE matricula_id = ANY($1)', [ids.matriculas]);
    await pool.query('DELETE FROM matriculas WHERE id = ANY($1)', [ids.matriculas]);
    await pool.query('DELETE FROM usuarios WHERE id = ANY($1)', [ids.usuarios]);
    await pool.query('DELETE FROM planos WHERE id = ANY($1)', [ids.planos]);
  }

  test('gera cobrança pendente quando a matrícula ativa vence hoje', async () => {
    const user = await criarUsuario();
    const plano = await criarPlano({ preco_mensal: 109.9, duracao_dias: 30 });
    const matricula = await criarMatricula({
      usuario_id: user.id, plano_id: plano.id, status: 'ativa', data_vencimento: new Date(),
    });

    await processarVencimentos();

    const { rows: pagamentos } = await pool.query(
      'SELECT * FROM pagamentos WHERE matricula_id = $1', [matricula.id]
    );
    expect(pagamentos).toHaveLength(1);
    expect(pagamentos[0].status).toBe('pendente');
    expect(pagamentos[0].gerado_automaticamente).toBe(true);

    const { rows: [matriculaDepois] } = await pool.query('SELECT * FROM matriculas WHERE id = $1', [matricula.id]);
    expect(matriculaDepois.status).toBe('ativa');
    expect(new Date(matriculaDepois.data_vencimento).toDateString()).toBe(new Date(matricula.data_vencimento).toDateString());

    await limpar({ usuarios: [user.id], planos: [plano.id], matriculas: [matricula.id] });
  });

  test('não duplica cobrança se rodar duas vezes no mesmo dia', async () => {
    const user = await criarUsuario();
    const plano = await criarPlano();
    const matricula = await criarMatricula({
      usuario_id: user.id, plano_id: plano.id, status: 'ativa', data_vencimento: new Date(),
    });

    await processarVencimentos();
    await processarVencimentos();

    const { rows: pagamentos } = await pool.query(
      'SELECT * FROM pagamentos WHERE matricula_id = $1', [matricula.id]
    );
    expect(pagamentos).toHaveLength(1);

    await limpar({ usuarios: [user.id], planos: [plano.id], matriculas: [matricula.id] });
  });

  test('marca vencida quando o vencimento já passou', async () => {
    const user = await criarUsuario();
    const plano = await criarPlano();
    const matricula = await criarMatricula({
      usuario_id: user.id, plano_id: plano.id, status: 'ativa',
      data_vencimento: new Date(Date.now() - 2 * 86400000),
    });

    await processarVencimentos();

    const { rows: [atualizada] } = await pool.query('SELECT status FROM matriculas WHERE id = $1', [matricula.id]);
    expect(atualizada.status).toBe('vencida');

    await limpar({ usuarios: [user.id], planos: [plano.id], matriculas: [matricula.id] });
  });

  test('marca suspensa quando o atraso passa da tolerância configurada', async () => {
    await pool.query('UPDATE configuracoes SET dias_tolerancia_bloqueio = 5 WHERE id = 1');
    const user = await criarUsuario();
    const plano = await criarPlano();
    const matricula = await criarMatricula({
      usuario_id: user.id, plano_id: plano.id, status: 'vencida',
      data_vencimento: new Date(Date.now() - 6 * 86400000),
    });

    await processarVencimentos();

    const { rows: [atualizada] } = await pool.query('SELECT status FROM matriculas WHERE id = $1', [matricula.id]);
    expect(atualizada.status).toBe('suspensa');

    await limpar({ usuarios: [user.id], planos: [plano.id], matriculas: [matricula.id] });
  });

  test('não mexe em matrícula vencida dentro do prazo de tolerância', async () => {
    await pool.query('UPDATE configuracoes SET dias_tolerancia_bloqueio = 5 WHERE id = 1');
    const user = await criarUsuario();
    const plano = await criarPlano();
    const matricula = await criarMatricula({
      usuario_id: user.id, plano_id: plano.id, status: 'vencida',
      data_vencimento: new Date(Date.now() - 2 * 86400000),
    });

    await processarVencimentos();

    const { rows: [atualizada] } = await pool.query('SELECT status FROM matriculas WHERE id = $1', [matricula.id]);
    expect(atualizada.status).toBe('vencida');

    await limpar({ usuarios: [user.id], planos: [plano.id], matriculas: [matricula.id] });
  });
});
```

- [ ] **Step 2: Rodar o teste pra confirmar que falha**

Run: `cd backend && NODE_ENV=test npx jest src/jobs/jobWorker.test.js`
Expected: FAIL — `processarVencimentos is not a function` (ainda não exportado)

- [ ] **Step 3: Implementar `processarVencimentos` em `jobWorker.js`**

No topo de `backend/src/jobs/jobWorker.js`, adicione o import (linha 2, junto aos outros requires):

```javascript
const { getGatewayAdapter } = require('../services/gateway');
```

Adicione a função antes de `async function executarJobsPendentes()` (linha 104):

```javascript
async function processarVencimentos() {
  const adapter = getGatewayAdapter();

  // 1. Matrículas ativas vencendo hoje: gera a cobrança da próxima renovação.
  //    Não mexe em status/data_vencimento aqui — só a confirmação do
  //    pagamento (manual ou via webhook) avança o ciclo, pra não dar
  //    carência automática antes da tolerância configurada.
  const { rows: vencendoHoje } = await pool.query(`
    SELECT m.id AS matricula_id, m.usuario_id, m.data_vencimento, p.preco_mensal, u.telefone, u.nome
    FROM matriculas m
    JOIN planos p ON p.id = m.plano_id
    JOIN usuarios u ON u.id = m.usuario_id
    WHERE m.status = 'ativa' AND m.data_vencimento::date = CURRENT_DATE
      AND NOT EXISTS (
        SELECT 1 FROM pagamentos
        WHERE matricula_id = m.id AND gerado_automaticamente = TRUE AND created_at::date = CURRENT_DATE
      )
  `);

  for (const m of vencendoHoje) {
    const { gateway_charge_id, link_pagamento } = await adapter.criarCobranca({
      valor: m.preco_mensal,
      vencimento: m.data_vencimento,
      usuario: { id: m.usuario_id, telefone: m.telefone },
    });

    await pool.query(
      `INSERT INTO pagamentos (matricula_id, usuario_id, valor, status, gateway, gateway_charge_id, link_pagamento, gerado_automaticamente)
       VALUES ($1, $2, $3, 'pendente', $4, $5, $6, TRUE)`,
      [m.matricula_id, m.usuario_id, m.preco_mensal, process.env.PAYMENT_GATEWAY || 'manual', gateway_charge_id, link_pagamento]
    );

    await pool.query(
      `INSERT INTO jobs (tipo, payload, agendado_para) VALUES ($1, $2, NOW())`,
      ['whatsapp_cobranca_gerada', JSON.stringify({ telefone: m.telefone, nome: m.nome, link_pagamento })]
    );
  }

  // 2. Ativas com vencimento no passado → vencida
  await pool.query(`
    UPDATE matriculas SET status = 'vencida', updated_at = NOW()
    WHERE status = 'ativa' AND data_vencimento::date < CURRENT_DATE
  `);

  // 3. Vencidas além da tolerância configurada → suspensa
  const { rows: [{ dias_tolerancia_bloqueio }] } = await pool.query(
    'SELECT dias_tolerancia_bloqueio FROM configuracoes WHERE id = 1'
  );
  await pool.query(
    `UPDATE matriculas SET status = 'suspensa', updated_at = NOW()
     WHERE status = 'vencida' AND data_vencimento::date <= CURRENT_DATE - $1::int`,
    [dias_tolerancia_bloqueio]
  );
}
```

No final do arquivo, atualize o `module.exports` (linha 142) para:

```javascript
module.exports = { startJobWorker, processarVencimentos };
```

- [ ] **Step 4: Rodar o teste pra confirmar que passa**

Run: `cd backend && NODE_ENV=test npx jest src/jobs/jobWorker.test.js`
Expected: PASS (5 testes)

- [ ] **Step 5: Commit**

```bash
git add backend/src/jobs/jobWorker.js backend/src/jobs/jobWorker.test.js
git commit -m "feat(financeiro): gera cobrança automática no vencimento e aplica bloqueio gradual"
```

---

### Task 7: jobWorker — processar jobs de cobrança/atraso e agendar lembrete de atraso

**Files:**
- Modify: `backend/src/jobs/jobWorker.js`
- Test: `backend/src/jobs/jobWorker.test.js` (estende o arquivo da Task 6)

**Interfaces:**
- Consumes: `enviarCobrancaGerada`, `enviarLembreteAtraso` (Task 4); `processarVencimentos` (Task 6, roda antes de `agendarAutomacoes` gerar os lembretes de atraso).
- Produces: `processarJob` trata os tipos `whatsapp_cobranca_gerada` e `whatsapp_atraso`; `agendarAutomacoes` agenda lembrete de atraso a cada 2 dias pra matrícula `vencida`/`suspensa`.

- [ ] **Step 1: Escrever o teste (falhando)**

Adicione ao final de `backend/src/jobs/jobWorker.test.js`:

```javascript
const { agendarAutomacoes, processarJob } = require('./jobWorker');

describe('processarJob — novos tipos', () => {
  afterAll(async () => {
    await pool.end();
  });

  test('whatsapp_cobranca_gerada não lança erro', async () => {
    await expect(processarJob({
      tipo: 'whatsapp_cobranca_gerada',
      payload: { telefone: '67999999999', nome: 'Maria', link_pagamento: 'https://pay.example.com/x' },
    })).resolves.not.toThrow();
  });

  test('whatsapp_atraso não lança erro', async () => {
    await expect(processarJob({
      tipo: 'whatsapp_atraso',
      payload: { telefone: '67999999999', nome: 'Maria', dias_atraso: 3 },
    })).resolves.not.toThrow();
  });
});

describe('agendarAutomacoes — lembrete de atraso', () => {
  afterAll(async () => {
    await pool.end();
  });

  test('agenda job whatsapp_atraso pra matrícula vencida e não duplica no mesmo dia', async () => {
    const user = await criarUsuario();
    const plano = await criarPlano();
    const matricula = await criarMatricula({
      usuario_id: user.id, plano_id: plano.id, status: 'vencida',
      data_vencimento: new Date(Date.now() - 1 * 86400000),
    });

    await pool.query(`DELETE FROM jobs WHERE tipo = 'whatsapp_atraso'`);
    await pool.query(`DELETE FROM automacoes_log WHERE usuario_id = $1 AND tipo = 'atraso'`, [user.id]);

    await agendarAutomacoes();
    await agendarAutomacoes();

    const { rows: jobs } = await pool.query(
      `SELECT * FROM jobs WHERE tipo = 'whatsapp_atraso' AND payload->>'telefone' = $1`,
      [user.telefone]
    );
    expect(jobs).toHaveLength(1);

    await pool.query('DELETE FROM jobs WHERE id = ANY($1)', [jobs.map((j) => j.id)]);
    await pool.query(`DELETE FROM automacoes_log WHERE usuario_id = $1`, [user.id]);
    await pool.query('DELETE FROM matriculas WHERE id = $1', [matricula.id]);
    await pool.query('DELETE FROM usuarios WHERE id = $1', [user.id]);
    await pool.query('DELETE FROM planos WHERE id = $1', [plano.id]);
  });
});
```

- [ ] **Step 2: Rodar o teste pra confirmar que falha**

Run: `cd backend && NODE_ENV=test npx jest src/jobs/jobWorker.test.js -t "novos tipos|lembrete de atraso"`
Expected: FAIL — `processarJob`/`agendarAutomacoes` não exportados, e o tipo `whatsapp_atraso` não é reconhecido

- [ ] **Step 3: Implementar**

Em `backend/src/jobs/jobWorker.js`, adicione o import do whatsappService já existente (linha 2, já presente: `const whatsapp = require('../services/whatsappService');` — mantenha).

Atualize `processarJob` (linhas 4-14) para:

```javascript
async function processarJob(job) {
  const { tipo, payload } = job;

  if (tipo === 'whatsapp_ausencia') {
    await whatsapp.enviarLembreteAusencia(payload.telefone, payload.nome, payload.dias);
  } else if (tipo === 'whatsapp_vencimento') {
    await whatsapp.enviarLembreteVencimento(payload.telefone, payload.nome, payload.dias_restantes);
  } else if (tipo === 'whatsapp_aniversario') {
    await whatsapp.enviarPaizens(payload.telefone, payload.nome);
  } else if (tipo === 'whatsapp_cobranca_gerada') {
    await whatsapp.enviarCobrancaGerada(payload.telefone, payload.nome, payload.link_pagamento);
  } else if (tipo === 'whatsapp_atraso') {
    await whatsapp.enviarLembreteAtraso(payload.telefone, payload.nome, payload.dias_atraso);
  }
}
```

Em `agendarAutomacoes`, adicione o bloco de atraso logo antes do bloco de aniversário (antes da linha `// Aniversário`, atualmente linha 77):

```javascript
  // Atraso: matrícula vencida/suspensa, repete a cada 2 dias até regularizar
  const { rows: atrasados } = await pool.query(`
    SELECT u.id, u.nome, u.telefone,
           (CURRENT_DATE - m.data_vencimento::date)::int AS dias_atraso
    FROM matriculas m JOIN usuarios u ON u.id = m.usuario_id
    WHERE m.status IN ('vencida', 'suspensa') AND m.data_vencimento::date < CURRENT_DATE
  `);

  for (const a of atrasados) {
    const jaEnviou = await pool.query(
      `SELECT id FROM automacoes_log WHERE usuario_id = $1 AND tipo = 'atraso'
       AND created_at > NOW() - INTERVAL '2 days'`,
      [a.id]
    );
    if (jaEnviou.rows.length) continue;

    await pool.query(
      `INSERT INTO jobs (tipo, payload, agendado_para) VALUES ($1, $2, NOW())`,
      ['whatsapp_atraso', JSON.stringify({ telefone: a.telefone, nome: a.nome, dias_atraso: a.dias_atraso })]
    );
    await pool.query(
      `INSERT INTO automacoes_log (usuario_id, tipo, mensagem, status) VALUES ($1, 'atraso', $2, 'enviado')`,
      [a.id, `Lembrete de atraso: ${a.dias_atraso} dia(s)`]
    );
  }

```

Atualize o `module.exports` (da Task 6) pra:

```javascript
module.exports = { startJobWorker, processarVencimentos, agendarAutomacoes, processarJob };
```

Por fim, no `setInterval` de `startJobWorker` (linha ~130), chame `processarVencimentos()` antes de `agendarAutomacoes()`:

```javascript
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

  console.log('⚙️  JobWorker iniciado');
}
```

- [ ] **Step 4: Rodar todos os testes do jobWorker pra confirmar que passam**

Run: `cd backend && NODE_ENV=test npx jest src/jobs/jobWorker.test.js`
Expected: PASS (8 testes no total, Tasks 6+7)

- [ ] **Step 5: Commit**

```bash
git add backend/src/jobs/jobWorker.js backend/src/jobs/jobWorker.test.js
git commit -m "feat(financeiro): processa jobs de cobrança/atraso e agenda lembrete de inadimplência"
```

---

### Task 8: Confirmação de pagamento estende a matrícula quando a cobrança é automática

**Files:**
- Modify: `backend/src/routes/pagamentos.js`
- Test: `backend/src/routes/pagamentos.test.js`

**Interfaces:**
- Consumes: `criarUsuario`, `criarPlano`, `criarMatricula`, `gerarToken` (Task 5).
- Produces: `PATCH /api/pagamentos/:id/confirmar` estende `matriculas.data_vencimento` (base = maior entre agora e o vencimento atual, + `duracao_dias` do plano) e põe `status = 'ativa'` quando `pagamento.gerado_automaticamente` é `true`; comportamento existente (ativa só quando `status = 'suspensa'`, sem mexer em `data_vencimento`) preservado para pagamentos não-automáticos.

- [ ] **Step 1: Escrever o teste (falhando)**

```javascript
// backend/src/routes/pagamentos.test.js
const request = require('supertest');
const app = require('../server');
const pool = require('../config/db');
const { criarUsuario, criarPlano, criarMatricula, gerarToken } = require('../testUtils/fixtures');

describe('PATCH /api/pagamentos/:id/confirmar', () => {
  afterAll(async () => {
    await pool.end();
  });

  test('pagamento gerado automaticamente estende data_vencimento e reativa a matrícula suspensa', async () => {
    const admin = await criarUsuario({ role: 'dono' });
    const aluno = await criarUsuario();
    const plano = await criarPlano({ duracao_dias: 30 });
    const vencimentoAntigo = new Date(Date.now() - 10 * 86400000);
    const matricula = await criarMatricula({
      usuario_id: aluno.id, plano_id: plano.id, status: 'suspensa', data_vencimento: vencimentoAntigo,
    });
    const { rows: [pagamento] } = await pool.query(
      `INSERT INTO pagamentos (matricula_id, usuario_id, valor, status, gerado_automaticamente)
       VALUES ($1, $2, $3, 'pendente', TRUE) RETURNING *`,
      [matricula.id, aluno.id, plano.preco_mensal]
    );

    const res = await request(app)
      .patch(`/api/pagamentos/${pagamento.id}/confirmar`)
      .set('Authorization', `Bearer ${gerarToken(admin)}`)
      .send({ metodo: 'pix' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('pago');

    const { rows: [matriculaDepois] } = await pool.query('SELECT * FROM matriculas WHERE id = $1', [matricula.id]);
    expect(matriculaDepois.status).toBe('ativa');
    const esperado = new Date();
    esperado.setDate(esperado.getDate() + plano.duracao_dias);
    expect(new Date(matriculaDepois.data_vencimento).toDateString()).toBe(esperado.toDateString());

    await pool.query('DELETE FROM pagamentos WHERE id = $1', [pagamento.id]);
    await pool.query('DELETE FROM matriculas WHERE id = $1', [matricula.id]);
    await pool.query('DELETE FROM usuarios WHERE id = ANY($1)', [[admin.id, aluno.id]]);
    await pool.query('DELETE FROM planos WHERE id = $1', [plano.id]);
  });

  test('pagamento não automático continua com o comportamento atual (não mexe em data_vencimento)', async () => {
    const admin = await criarUsuario({ role: 'dono' });
    const aluno = await criarUsuario();
    const plano = await criarPlano();
    const vencimentoOriginal = new Date(Date.now() + 20 * 86400000);
    const matricula = await criarMatricula({
      usuario_id: aluno.id, plano_id: plano.id, status: 'suspensa', data_vencimento: vencimentoOriginal,
    });
    const { rows: [pagamento] } = await pool.query(
      `INSERT INTO pagamentos (matricula_id, usuario_id, valor, status)
       VALUES ($1, $2, $3, 'pendente') RETURNING *`,
      [matricula.id, aluno.id, plano.preco_mensal]
    );

    const res = await request(app)
      .patch(`/api/pagamentos/${pagamento.id}/confirmar`)
      .set('Authorization', `Bearer ${gerarToken(admin)}`)
      .send({ metodo: 'pix' });

    expect(res.status).toBe(200);

    const { rows: [matriculaDepois] } = await pool.query('SELECT * FROM matriculas WHERE id = $1', [matricula.id]);
    expect(matriculaDepois.status).toBe('ativa');
    expect(new Date(matriculaDepois.data_vencimento).toISOString()).toBe(vencimentoOriginal.toISOString());

    await pool.query('DELETE FROM pagamentos WHERE id = $1', [pagamento.id]);
    await pool.query('DELETE FROM matriculas WHERE id = $1', [matricula.id]);
    await pool.query('DELETE FROM usuarios WHERE id = ANY($1)', [[admin.id, aluno.id]]);
    await pool.query('DELETE FROM planos WHERE id = $1', [plano.id]);
  });
});
```

- [ ] **Step 2: Rodar o teste pra confirmar que falha**

Run: `cd backend && NODE_ENV=test npx jest src/routes/pagamentos.test.js`
Expected: FAIL no primeiro teste — `data_vencimento` não é estendida hoje

- [ ] **Step 3: Implementar**

Em `backend/src/routes/pagamentos.js`, substitua o handler `PATCH /:id/confirmar` (linhas 24-59) por:

```javascript
// PATCH /api/pagamentos/:id/confirmar (admin)
router.patch('/:id/confirmar', authMiddleware, requireRole('admin', 'dono'), async (req, res, next) => {
  try {
    const { metodo = 'dinheiro' } = req.body;
    const { rows: [pag] } = await pool.query(
      `UPDATE pagamentos SET status = 'pago', metodo = $1, data_pagamento = NOW()
       WHERE id = $2 RETURNING *`,
      [metodo, req.params.id]
    );
    if (!pag) return res.status(404).json({ error: 'Pagamento não encontrado' });

    if (pag.gerado_automaticamente) {
      // Renovação automática confirmada: estende o ciclo a partir do maior
      // entre agora e o vencimento atual, e reativa a matrícula.
      const { rows: [matricula] } = await pool.query(
        `SELECT m.*, p.duracao_dias FROM matriculas m JOIN planos p ON p.id = m.plano_id WHERE m.id = $1`,
        [pag.matricula_id]
      );
      const base = new Date(Math.max(Date.now(), new Date(matricula.data_vencimento).getTime()));
      base.setDate(base.getDate() + matricula.duracao_dias);
      await pool.query(
        `UPDATE matriculas SET status = 'ativa', data_vencimento = $1, updated_at = NOW() WHERE id = $2`,
        [base, pag.matricula_id]
      );
    } else {
      // Matrícula criada sem pagamento imediato (fluxo existente do admin)
      const { rows: [matriculaAtivada] } = await pool.query(
        `UPDATE matriculas SET status = 'ativa', updated_at = NOW()
         WHERE id = $1 AND status = 'suspensa'
         RETURNING usuario_id`,
        [pag.matricula_id]
      );
      if (matriculaAtivada) {
        await xpService.adicionarXP(matriculaAtivada.usuario_id, 100, 'matricula');
        const { rows: [indicacao] } = await pool.query(
          `UPDATE indicacoes SET status = 'convertido', convertido_em = NOW()
           WHERE indicado_id = $1 AND status = 'pendente'
           RETURNING indicador_id`,
          [matriculaAtivada.usuario_id]
        );
        if (indicacao) {
          await xpService.adicionarXP(indicacao.indicador_id, 200, 'indicacao');
        }
      }
    }

    res.json(pag);
  } catch (err) {
    next(err);
  }
});
```

- [ ] **Step 4: Rodar o teste pra confirmar que passa**

Run: `cd backend && NODE_ENV=test npx jest src/routes/pagamentos.test.js`
Expected: PASS (2 testes)

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/pagamentos.js backend/src/routes/pagamentos.test.js
git commit -m "feat(financeiro): confirmação de cobrança automática estende a matrícula"
```

---

### Task 9: Dashboard financeiro do dono — inadimplentes e tolerância de bloqueio

**Files:**
- Modify: `backend/src/routes/admin.js`
- Modify: `backend/src/routes/configuracoes.js`
- Test: `backend/src/routes/admin.test.js`
- Test: `backend/src/routes/configuracoes.test.js`

**Interfaces:**
- Consumes: fixtures (Task 5).
- Produces: `GET /api/admin/financeiro` inclui `inadimplentes_detalhe` (array) e `dias_tolerancia_bloqueio`; `PATCH /api/configuracoes` aceita `dias_tolerancia_bloqueio`.

- [ ] **Step 1: Escrever os testes (falhando)**

```javascript
// backend/src/routes/admin.test.js
const request = require('supertest');
const app = require('../server');
const pool = require('../config/db');
const { criarUsuario, criarPlano, criarMatricula, gerarToken } = require('../testUtils/fixtures');

describe('GET /api/admin/financeiro — inadimplentes', () => {
  afterAll(async () => {
    await pool.end();
  });

  test('lista alunos com matrícula vencida ou suspensa em inadimplentes_detalhe', async () => {
    const dono = await criarUsuario({ role: 'dono' });
    const aluno = await criarUsuario({ nome: 'Aluno Vencido' });
    const plano = await criarPlano();
    const matricula = await criarMatricula({
      usuario_id: aluno.id, plano_id: plano.id, status: 'vencida',
      data_vencimento: new Date(Date.now() - 3 * 86400000),
    });

    const res = await request(app)
      .get('/api/admin/financeiro')
      .set('Authorization', `Bearer ${gerarToken(dono)}`);

    expect(res.status).toBe(200);
    expect(res.body.dias_tolerancia_bloqueio).toBeDefined();
    expect(res.body.inadimplentes_detalhe.some((i) => i.usuario_id === aluno.id)).toBe(true);

    await pool.query('DELETE FROM matriculas WHERE id = $1', [matricula.id]);
    await pool.query('DELETE FROM usuarios WHERE id = ANY($1)', [[dono.id, aluno.id]]);
    await pool.query('DELETE FROM planos WHERE id = $1', [plano.id]);
  });
});
```

```javascript
// backend/src/routes/configuracoes.test.js
const request = require('supertest');
const app = require('../server');
const pool = require('../config/db');
const { criarUsuario, gerarToken } = require('../testUtils/fixtures');

describe('PATCH /api/configuracoes — dias_tolerancia_bloqueio', () => {
  afterAll(async () => {
    await pool.query('UPDATE configuracoes SET dias_tolerancia_bloqueio = 5 WHERE id = 1');
    await pool.end();
  });

  test('dono consegue alterar dias_tolerancia_bloqueio', async () => {
    const dono = await criarUsuario({ role: 'dono' });

    const res = await request(app)
      .patch('/api/configuracoes')
      .set('Authorization', `Bearer ${gerarToken(dono)}`)
      .send({ dias_tolerancia_bloqueio: 7 });

    expect(res.status).toBe(200);
    expect(res.body.dias_tolerancia_bloqueio).toBe(7);

    await pool.query('DELETE FROM usuarios WHERE id = $1', [dono.id]);
  });
});
```

- [ ] **Step 2: Rodar os testes pra confirmar que falham**

Run: `cd backend && NODE_ENV=test npx jest src/routes/admin.test.js src/routes/configuracoes.test.js`
Expected: FAIL — `inadimplentes_detalhe`/`dias_tolerancia_bloqueio` undefined na resposta

- [ ] **Step 3: Implementar em `admin.js`**

Em `backend/src/routes/admin.js`, dentro do handler `GET /financeiro` (linha 61), adicione a query de inadimplentes e inclua no `Promise.all` e no `res.json`. Substitua o bloco entre as linhas 63-70 por:

```javascript
    const [ativos, faturamentoMes, faturamentoMesAnterior, inadimplentes, novos, config, inadimplentesDetalhe] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS total FROM matriculas WHERE status = 'ativa'`),
      pool.query(`SELECT COALESCE(SUM(valor), 0)::numeric AS total FROM pagamentos WHERE status = 'pago' AND DATE_TRUNC('month', data_pagamento) = DATE_TRUNC('month', NOW())`),
      pool.query(`SELECT COALESCE(SUM(valor), 0)::numeric AS total FROM pagamentos WHERE status = 'pago' AND DATE_TRUNC('month', data_pagamento) = DATE_TRUNC('month', NOW() - INTERVAL '1 month')`),
      pool.query(`SELECT COUNT(*)::int AS total FROM matriculas WHERE status = 'vencida'`),
      pool.query(`SELECT COUNT(*)::int AS total FROM usuarios WHERE role = 'aluno' AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())`),
      pool.query(`SELECT * FROM configuracoes WHERE id = 1`),
      pool.query(`
        SELECT u.id AS usuario_id, u.nome, u.telefone, m.status AS matricula_status, m.data_vencimento,
               (CURRENT_DATE - m.data_vencimento::date)::int AS dias_atraso
        FROM matriculas m JOIN usuarios u ON u.id = m.usuario_id
        WHERE m.status IN ('vencida', 'suspensa')
        ORDER BY m.data_vencimento ASC
      `),
    ]);
```

E, no objeto retornado por `res.json` (linha 104), adicione os dois campos novos após `metas`:

```javascript
      metas: {
        nome_academia: cfg.nome_academia,
        meta_faturamento_mensal: Number(cfg.meta_faturamento_mensal),
        meta_novos_alunos_mensal: cfg.meta_novos_alunos_mensal,
        progresso_faturamento_pct: cfg.meta_faturamento_mensal > 0
          ? clamp((faturamento_mes / Number(cfg.meta_faturamento_mensal)) * 100)
          : 0,
        progresso_novos_alunos_pct: cfg.meta_novos_alunos_mensal > 0
          ? clamp((novos_mes / cfg.meta_novos_alunos_mensal) * 100)
          : 0,
      },
      dias_tolerancia_bloqueio: cfg.dias_tolerancia_bloqueio,
      inadimplentes_detalhe: inadimplentesDetalhe.rows,
    });
```

- [ ] **Step 4: Implementar em `configuracoes.js`**

Substitua o handler `PATCH /` (linhas 17-34) por:

```javascript
// PATCH /api/configuracoes (dono)
router.patch('/', authMiddleware, requireRole('dono'), async (req, res, next) => {
  try {
    const { nome_academia, meta_faturamento_mensal, meta_novos_alunos_mensal, dias_tolerancia_bloqueio } = req.body;
    const { rows } = await pool.query(
      `UPDATE configuracoes SET
         nome_academia = COALESCE($1, nome_academia),
         meta_faturamento_mensal = COALESCE($2, meta_faturamento_mensal),
         meta_novos_alunos_mensal = COALESCE($3, meta_novos_alunos_mensal),
         dias_tolerancia_bloqueio = COALESCE($4, dias_tolerancia_bloqueio),
         updated_at = NOW()
       WHERE id = 1 RETURNING *`,
      [nome_academia, meta_faturamento_mensal, meta_novos_alunos_mensal, dias_tolerancia_bloqueio]
    );
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});
```

- [ ] **Step 5: Rodar os testes pra confirmar que passam**

Run: `cd backend && NODE_ENV=test npx jest src/routes/admin.test.js src/routes/configuracoes.test.js`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/admin.js backend/src/routes/configuracoes.js backend/src/routes/admin.test.js backend/src/routes/configuracoes.test.js
git commit -m "feat(financeiro): dashboard do dono lista inadimplentes e expõe tolerância de bloqueio"
```

---

### Task 10: Dashboard e perfil do aluno mostram a matrícula mesmo vencida/suspensa

**Files:**
- Modify: `backend/src/routes/alunos.js`
- Test: `backend/src/routes/alunos.test.js`

**Interfaces:**
- Consumes: fixtures (Task 5).
- Produces: `GET /api/alunos/dashboard` e `GET /api/alunos/perfil` retornam `matricula_status`/`data_vencimento`/`plano_nome` da matrícula mais recente do aluno, independente do status (hoje só mostravam quando `status = 'ativa'`, escondendo justamente o caso vencida/suspensa que a Task 11 precisa exibir).

- [ ] **Step 1: Escrever o teste (falhando)**

```javascript
// backend/src/routes/alunos.test.js
const request = require('supertest');
const app = require('../server');
const pool = require('../config/db');
const { criarUsuario, criarPlano, criarMatricula, gerarToken } = require('../testUtils/fixtures');

describe('GET /api/alunos/dashboard e /perfil — matrícula suspensa continua visível', () => {
  afterAll(async () => {
    await pool.end();
  });

  test('dashboard mostra matricula_status suspensa em vez de esconder o plano', async () => {
    const aluno = await criarUsuario();
    const plano = await criarPlano({ nome: 'Plano Suspenso Teste' });
    const matricula = await criarMatricula({
      usuario_id: aluno.id, plano_id: plano.id, status: 'suspensa',
      data_vencimento: new Date(Date.now() - 10 * 86400000),
    });

    const res = await request(app)
      .get('/api/alunos/dashboard')
      .set('Authorization', `Bearer ${gerarToken(aluno)}`);

    expect(res.status).toBe(200);
    expect(res.body.matricula_status).toBe('suspensa');
    expect(res.body.plano_nome).toBe('Plano Suspenso Teste');

    await pool.query('DELETE FROM matriculas WHERE id = $1', [matricula.id]);
    await pool.query('DELETE FROM usuarios WHERE id = $1', [aluno.id]);
    await pool.query('DELETE FROM planos WHERE id = $1', [plano.id]);
  });

  test('perfil também mostra a matrícula suspensa', async () => {
    const aluno = await criarUsuario();
    const plano = await criarPlano({ nome: 'Plano Suspenso Teste 2' });
    const matricula = await criarMatricula({
      usuario_id: aluno.id, plano_id: plano.id, status: 'suspensa',
      data_vencimento: new Date(Date.now() - 10 * 86400000),
    });

    const res = await request(app)
      .get('/api/alunos/perfil')
      .set('Authorization', `Bearer ${gerarToken(aluno)}`);

    expect(res.status).toBe(200);
    expect(res.body.matricula_status).toBe('suspensa');
    expect(res.body.plano_nome).toBe('Plano Suspenso Teste 2');

    await pool.query('DELETE FROM matriculas WHERE id = $1', [matricula.id]);
    await pool.query('DELETE FROM usuarios WHERE id = $1', [aluno.id]);
    await pool.query('DELETE FROM planos WHERE id = $1', [plano.id]);
  });
});
```

- [ ] **Step 2: Rodar o teste pra confirmar que falha**

Run: `cd backend && NODE_ENV=test npx jest src/routes/alunos.test.js`
Expected: FAIL — `matricula_status`/`plano_nome` vêm `undefined` (o `LEFT JOIN ... AND m.status = 'ativa'` não bate com `suspensa`)

- [ ] **Step 3: Implementar**

Em `backend/src/routes/alunos.js`, substitua a query de `GET /dashboard` (linhas 11-19) por:

```javascript
      pool.query(
        `SELECT u.id, u.nome, u.email, u.foto_url, u.xp, u.sequencia_atual, u.maior_sequencia,
                m.status as matricula_status, m.data_vencimento, p.nome as plano_nome
         FROM usuarios u
         LEFT JOIN LATERAL (
           SELECT * FROM matriculas WHERE usuario_id = u.id ORDER BY created_at DESC LIMIT 1
         ) m ON true
         LEFT JOIN planos p ON p.id = m.plano_id
         WHERE u.id = $1`,
        [req.user.id]
      ),
```

E substitua a query de `GET /perfil` (linhas 51-54) por:

```javascript
    const { rows: [user] } = await pool.query(
      `SELECT u.id, u.nome, u.email, u.telefone, u.cpf, u.data_nascimento, u.foto_url,
              m.status as matricula_status, m.data_vencimento, p.nome as plano_nome
       FROM usuarios u
       LEFT JOIN LATERAL (
         SELECT * FROM matriculas WHERE usuario_id = u.id ORDER BY created_at DESC LIMIT 1
       ) m ON true
       LEFT JOIN planos p ON p.id = m.plano_id
       WHERE u.id = $1`,
      [req.user.id]
    );
```

- [ ] **Step 4: Rodar o teste pra confirmar que passa**

Run: `cd backend && NODE_ENV=test npx jest src/routes/alunos.test.js`
Expected: PASS (2 testes)

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/alunos.js backend/src/routes/alunos.test.js
git commit -m "fix(alunos): dashboard e perfil mostram matrícula vencida/suspensa em vez de escondê-la"
```

---

### Task 11: Banner de bloqueio no app do aluno

**Files:**
- Modify: `frontend/assets/js/app-effects.js`
- Modify: `frontend/assets/css/global.css`
- Modify: `frontend/dashboard.html`
- Modify: `frontend/assets/js/dashboard.js`

**Interfaces:**
- Consumes: `d.matricula_status`, `d.data_vencimento` de `GET /api/alunos/dashboard` (Task 10).
- Produces: `renderBloqueioBanner(containerId, { matricula_status, data_vencimento })` em `app-effects.js`, reaproveitável em outras páginas do aluno depois.

Esta task é só frontend (sem backend rodando não dá pra automatizar em Jest sem um DOM headless configurado, que o projeto não tem). A validação é manual: rodar o backend + abrir `dashboard.html` com um aluno de matrícula `suspensa` e confirmar visualmente. Os passos abaixo cobrem implementação; o "teste" é a verificação manual descrita no Step 3.

- [ ] **Step 1: Implementar `renderBloqueioBanner` em `app-effects.js`**

Adicione ao final de `frontend/assets/js/app-effects.js`, antes do `document.addEventListener('DOMContentLoaded', ...)` (linha 203):

```javascript
/* ===== Banner de bloqueio por matrícula suspensa ===== */
function renderBloqueioBanner(containerId, dados) {
  var el = document.getElementById(containerId);
  if (!el) return;

  if (dados.matricula_status !== 'suspensa') {
    el.innerHTML = '';
    return;
  }

  el.innerHTML =
    '<div class="bloqueio-banner" data-reveal>' +
      '<span class="bloqueio-banner-icon">' + Icons.icon('alert-triangle', { size: 20 }) + '</span>' +
      '<div>' +
        '<strong>Sua matrícula está com pagamento pendente.</strong>' +
        '<span>Vencida desde ' + formatData(dados.data_vencimento) + '. Regularize pelo link enviado no WhatsApp ou na recepção para voltar a acessar treinos, aulas e ranking.</span>' +
      '</div>' +
    '</div>';
  initReveal();
}
```

- [ ] **Step 2: Adicionar o CSS do banner em `global.css`**

Adicione ao final de `frontend/assets/css/global.css`:

```css
.bloqueio-banner {
  display: flex;
  gap: 0.85rem;
  align-items: flex-start;
  background: var(--color-danger-soft);
  border: 1px solid rgba(239, 68, 68, 0.22);
  border-radius: var(--radius-md, 12px);
  padding: 1rem 1.25rem;
  margin-bottom: 1.5rem;
}
.bloqueio-banner-icon { color: var(--color-danger); flex-shrink: 0; margin-top: 0.1rem; }
.bloqueio-banner strong { display: block; color: var(--color-danger); margin-bottom: 0.2rem; }
.bloqueio-banner span { color: var(--color-muted); font-size: 0.9rem; }
```

- [ ] **Step 3: Adicionar o container em `dashboard.html` e chamar no `dashboard.js`**

Em `frontend/dashboard.html`, adicione `<div id="bloqueio-banner"></div>` logo após a abertura de `<main class="container aluno-main">` (linha 34), antes de `<section id="cards-resumo">`:

```html
  <main class="container aluno-main">
    <div id="bloqueio-banner"></div>

    <section id="cards-resumo">
```

Em `frontend/assets/js/dashboard.js`, dentro de `carregarDashboard()`, logo após a linha que popula `dash-plano-badge` (linha 44, `planoBadge.textContent = ...`), adicione:

```javascript
    renderBloqueioBanner('bloqueio-banner', d);
```

- [ ] **Step 4: Verificação manual**

Suba o backend (`cd backend && npm run dev`) e sirva o frontend (`npx serve frontend` ou Live Server). Com um usuário de teste cuja matrícula esteja `suspensa` no banco (pode simular com `UPDATE matriculas SET status = 'suspensa' WHERE usuario_id = <id>`), acesse `dashboard.html` logado como esse aluno e confirme:
- O banner vermelho aparece no topo com a data de vencimento correta.
- Alunos com matrícula `ativa` não veem o banner (`dashboard.html` limpo).

- [ ] **Step 5: Commit**

```bash
git add frontend/assets/js/app-effects.js frontend/assets/css/global.css frontend/dashboard.html frontend/assets/js/dashboard.js
git commit -m "feat(financeiro): banner de bloqueio no dashboard do aluno pra matrícula suspensa"
```

---

### Task 12: Card "Minha assinatura" no perfil do aluno

**Files:**
- Modify: `frontend/perfil.html`
- Modify: `frontend/assets/js/perfil.js`

**Interfaces:**
- Consumes: `matricula_status`/`data_vencimento`/`plano_nome` de `GET /api/alunos/perfil` (Task 10); histórico via `GET /api/pagamentos/meus` (já existe, sem uso em tela).

Assim como a Task 11, a verificação é manual (é uma tela HTML sem lógica de negócio nova no backend).

- [ ] **Step 1: Adicionar o card em `perfil.html`**

Em `frontend/perfil.html`, adicione um novo `<section>` logo antes do `<form id="form-perfil">` (linha 38):

```html
      <section class="card" data-reveal style="margin-top:1.5rem;max-width:520px">
        <div class="row-between" style="margin-bottom:1rem">
          <h2>Minha assinatura</h2>
          <span class="badge" id="assinatura-status-badge">—</span>
        </div>
        <p class="text-muted" id="assinatura-plano" style="margin-bottom:0.25rem">—</p>
        <p class="text-muted" id="assinatura-vencimento" style="margin-bottom:1rem"></p>
        <div class="stack gap-sm" id="assinatura-historico"></div>
      </section>

```

- [ ] **Step 2: Popular o card em `perfil.js`**

Em `frontend/assets/js/perfil.js`, dentro de `carregarPerfil()`, logo após `document.getElementById('perfil-cpf').value = u.cpf || 'Não informado';` (linha 12), adicione:

```javascript
    const statusBadge = document.getElementById('assinatura-status-badge');
    const statusMap = {
      ativa: ['badge-success', 'Em dia'],
      vencida: ['badge-warning', 'Vencida'],
      suspensa: ['badge-danger', 'Suspensa'],
      cancelada: ['badge-muted', 'Cancelada'],
    };
    const [statusClass, statusLabel] = statusMap[u.matricula_status] || ['badge-muted', 'Sem plano'];
    statusBadge.className = `badge ${statusClass}`;
    statusBadge.textContent = statusLabel;

    document.getElementById('assinatura-plano').textContent = u.plano_nome ? `Plano ${u.plano_nome}` : 'Nenhum plano contratado.';
    document.getElementById('assinatura-vencimento').textContent = u.data_vencimento
      ? `Vencimento: ${formatData(u.data_vencimento)}`
      : '';

    try {
      const pagamentos = await api.get('/api/pagamentos/meus');
      const historicoEl = document.getElementById('assinatura-historico');
      historicoEl.innerHTML = pagamentos.length
        ? pagamentos.slice(0, 5).map((p) => `
            <div class="transaction-item">
              <span class="transaction-icon ${p.status}">${Icons.icon(p.status === 'pago' ? 'check-circle' : 'clock', { size: 16 })}</span>
              <div class="transaction-info">
                <strong>${p.plano_nome}</strong>
                <span>${formatData(p.data_pagamento || p.created_at)}</span>
              </div>
              <span class="transaction-value">${formatMoeda(p.valor)}</span>
            </div>
          `).join('')
        : '<div class="empty-state">Nenhum pagamento registrado ainda.</div>';
    } catch {
      document.getElementById('assinatura-historico').innerHTML = '<div class="empty-state">Não foi possível carregar o histórico.</div>';
    }
```

E torne `carregarPerfil` assíncrona corretamente — ela já é `async function carregarPerfil()` (linha 3), então o `await api.get('/api/pagamentos/meus')` acima funciona sem mudanças na assinatura da função.

- [ ] **Step 3: Verificação manual**

Com o backend rodando, acesse `perfil.html` logado como aluno com pelo menos um pagamento (rodando `POST /api/matriculas` no fluxo normal) e confirme:
- O card "Minha assinatura" mostra o plano, status com a cor certa (verde/amarelo/vermelho) e o vencimento.
- O histórico lista os pagamentos mais recentes com valor formatado em R$.
- Nenhum botão de pagamento aparece na tela (conforme decidido: pagamento é só via WhatsApp/recepção).

- [ ] **Step 4: Commit**

```bash
git add frontend/perfil.html frontend/assets/js/perfil.js
git commit -m "feat(financeiro): card 'Minha assinatura' no perfil do aluno (somente leitura)"
```

---

### Task 13: Lista de inadimplentes no financeiro do admin

**Files:**
- Modify: `frontend/admin/financeiro.html`
- Modify: `frontend/assets/js/admin-financeiro.js`

**Interfaces:**
- Consumes: `inadimplentes_detalhe` de `GET /api/admin/financeiro` (Task 9); reaproveita `PATCH /api/pagamentos/:id/confirmar` (já existe) — mas como a listagem é por aluno/matrícula e não por pagamento específico, o botão de ação leva o admin pra tela de Alunos (que já tem o fluxo de confirmação) em vez de duplicar lógica de pagamento aqui.

- [ ] **Step 1: Adicionar a seção em `financeiro.html`**

Em `frontend/admin/financeiro.html`, adicione uma nova seção logo após o `<div class="grid grid-2" style="margin-top:1.5rem">` de transações/metas (depois da linha 73, antes do `</div>` de fechamento do `.main-content` na linha 74):

```html
      <div class="card" data-reveal style="margin-top:1.5rem">
        <div class="row-between" style="margin-bottom:1rem">
          <h2>Inadimplentes</h2>
          <span class="text-muted" id="inadimplentes-count"></span>
        </div>
        <div id="inadimplentes-lista" class="stack gap-sm"></div>
      </div>
```

- [ ] **Step 2: Popular a lista em `admin-financeiro.js`**

Em `frontend/assets/js/admin-financeiro.js`, dentro de `carregarFinanceiro()`, logo após `renderMetas(d.metas, d.faturamento_mes, d.novos_mes);` (linha 43), adicione:

```javascript
    renderInadimplentes(d.inadimplentes_detalhe);
```

E adicione a função `renderInadimplentes` antes de `carregarFinanceiro();` (linha 131, a chamada final do arquivo):

```javascript
function renderInadimplentes(lista) {
  const el = document.getElementById('inadimplentes-lista');
  document.getElementById('inadimplentes-count').textContent = lista.length
    ? `${lista.length} aluno(s)`
    : '';

  el.innerHTML = lista.length
    ? lista.map((i) => `
        <div class="transaction-item">
          <span class="transaction-icon ${i.matricula_status === 'suspensa' ? 'vencido' : 'pendente'}">
            ${Icons.icon('alert-triangle', { size: 16 })}
          </span>
          <div class="transaction-info">
            <strong>${i.nome}</strong>
            <span>${i.matricula_status === 'suspensa' ? 'Suspensa' : 'Vencida'} há ${i.dias_atraso} dia(s) — venceu em ${formatData(i.data_vencimento)}</span>
          </div>
          <a href="alunos.html" class="btn btn-ghost btn-sm">Ver aluno</a>
        </div>
      `).join('')
    : '<div class="empty-state">Nenhum aluno inadimplente no momento.</div>';
}
```

- [ ] **Step 3: Verificação manual**

Com o backend rodando e ao menos um aluno com matrícula `vencida`/`suspensa` no banco (usar o mesmo `UPDATE` manual da Task 11), acesse `admin/financeiro.html` logado como `dono` e confirme:
- A seção "Inadimplentes" lista o(s) aluno(s) certo(s) com os dias de atraso.
- O botão "Ver aluno" leva pra `alunos.html`.
- Sem inadimplentes, aparece o estado vazio.

- [ ] **Step 4: Commit**

```bash
git add frontend/admin/financeiro.html frontend/assets/js/admin-financeiro.js
git commit -m "feat(financeiro): lista de inadimplentes no dashboard financeiro do dono"
```

---

## Ordem de execução

Tasks 1→10 são estritamente sequenciais (cada uma depende da anterior: migration → adapter → webhook → whatsapp → fixtures → jobWorker parte 1 → jobWorker parte 2 → confirmação → admin/configuracoes → alunos). Tasks 11, 12 e 13 dependem apenas da Task 10 e podem ser feitas em paralelo entre si.

## Verificação final

Depois da Task 10, rode a suíte inteira em modo serial (evita duas tasks disputando a mesma linha da tabela `configuracoes` em paralelo):

Run: `cd backend && NODE_ENV=test npx jest --runInBand --forceExit`
Expected: todos os testes de `src/**/*.test.js` passam, incluindo os das Tasks 1-10.

Nota: `npm test` (o script do `package.json`) quebra em máquinas Windows porque `cmd.exe` não entende a sintaxe `NODE_ENV=test comando` — use sempre `NODE_ENV=test npx jest ...` diretamente, como em todos os outros passos deste plano.
