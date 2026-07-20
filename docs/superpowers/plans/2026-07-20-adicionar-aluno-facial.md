# Assistente "Adicionar Aluno" com Verificação Facial Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Adicionar um botão "Adicionar aluno" (separado do "Novo Cliente" existente) na página Alunos do admin, que abre um assistente de 3 passos (dados → plano → verificação facial), e fechar a lacuna que faz `POST /api/admin/matriculas` nunca sincronizar o aluno com a catraca.

**Architecture:** Backend Express + Postgres, testes Jest/Supertest contra banco de teste real (sem mocks de DB, só a API HTTP da catraca é mockada via `jest.mock('../services/catracaService')` ou `jest.mock('./catraca/config')`). Frontend HTML/CSS/JS vanilla sem build step, reaproveitando os endpoints e componentes (`<dialog>`, `.switch`, `carregarPlanos()`, `gerarSenhaTemp()`) que já existem em `admin-alunos.js`.

**Tech Stack:** Node.js/Express/Postgres/Jest (backend), HTML/CSS/JS vanilla (frontend).

## Global Constraints

- Sem dependências novas (nem backend nem frontend).
- A captura do rosto acontece no equipamento físico (iDFace), nunca no navegador — nenhuma câmera/webcam no frontend.
- Botão "Adicionar aluno" fica dentro de `.page-head` (canto superior direito da página, mesmo padrão já usado em `admin/planos.html`, `admin/equipe.html`, `admin/aulas.html`), não dentro de `.filters-row` onde fica o "Novo Cliente".
- O botão "Novo Cliente" existente não é alterado nem removido.
- `user_faces` como nome de objeto na API da Control iD é uma suposição não testada contra o equipamento real — mesmo risco assumido pelo resto da integração de catraca (ver spec, seção "Testes").

---

## Task 1: Fechar a lacuna — `POST /api/admin/matriculas` passa a sincronizar com a catraca

**Files:**
- Modify: `backend/src/routes/admin.js:1-6` (imports), `backend/src/routes/admin.js:280-294` (hook)
- Modify: `backend/src/routes/admin.test.js` (corrige escopo do `afterAll` + novo describe)

**Interfaces:**
- Consumes: `catracaService.sincronizarAluno(usuarioId)` e `catracaService.liberarAcesso(usuarioId)` — já existem em `backend/src/services/catracaService.js`, mesma assinatura usada em `backend/src/routes/matriculas.js:50-51`.
- Produces: nenhuma interface nova — só adiciona uma chamada a mais dentro de um endpoint existente.

- [ ] **Step 1: Corrigir o escopo do `afterAll(pool.end())` em `admin.test.js` antes de adicionar um novo describe**

O arquivo hoje declara `afterAll(() => pool.end())` **dentro** do primeiro `describe`
(`GET /api/admin/financeiro`). Isso fecha o pool de conexões assim que esse
describe termina — se um segundo describe for adicionado depois dele no mesmo
arquivo, suas queries falhariam contra um pool já fechado. Mover pro escopo do
arquivo (fora de qualquer describe) resolve isso pra qualquer describe futuro,
não só o que este plano adiciona.

Ler `backend/src/routes/admin.test.js` inteiro (32 linhas) e substituir por:

```javascript
const request = require('supertest');
const app = require('../server');
const pool = require('../config/db');
const { criarUsuario, criarPlano, criarMatricula, gerarToken } = require('../testUtils/fixtures');

afterAll(async () => {
  await pool.end();
});

describe('GET /api/admin/financeiro — inadimplentes', () => {
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

- [ ] **Step 2: Escrever os testes que falham (novo describe em `admin.test.js`)**

Adicionar ao final de `backend/src/routes/admin.test.js`:

```javascript
jest.mock('../services/catracaService');
const catracaService = require('../services/catracaService');

describe('POST /api/admin/matriculas — integração com a catraca', () => {
  test('sincroniza e libera acesso quando o admin cria a matrícula já ativa (com pagamento)', async () => {
    catracaService.sincronizarAluno.mockResolvedValue(undefined);
    catracaService.liberarAcesso.mockResolvedValue(undefined);

    const admin = await criarUsuario({ role: 'admin' });
    const aluno = await criarUsuario({ role: 'aluno' });
    const plano = await criarPlano({ nome: 'Plano Admin Matricula Catraca Teste' });

    const res = await request(app)
      .post('/api/admin/matriculas')
      .set('Authorization', `Bearer ${gerarToken(admin)}`)
      .send({ usuario_id: aluno.id, plano_id: plano.id, metodo_pagamento: 'pix' });

    expect(res.status).toBe(201);
    expect(catracaService.sincronizarAluno).toHaveBeenCalledWith(aluno.id);
    expect(catracaService.liberarAcesso).toHaveBeenCalledWith(aluno.id);

    await pool.query('DELETE FROM pagamentos WHERE matricula_id = $1', [res.body.id]);
    await pool.query('DELETE FROM matriculas WHERE id = $1', [res.body.id]);
    await pool.query('DELETE FROM planos WHERE id = $1', [plano.id]);
    await pool.query('DELETE FROM usuarios WHERE id = ANY($1)', [[admin.id, aluno.id]]);
  });

  test('não sincroniza com a catraca quando a matrícula fica pendente (sem método de pagamento)', async () => {
    const admin = await criarUsuario({ role: 'admin' });
    const aluno = await criarUsuario({ role: 'aluno' });
    const plano = await criarPlano({ nome: 'Plano Admin Matricula Pendente Teste' });

    const res = await request(app)
      .post('/api/admin/matriculas')
      .set('Authorization', `Bearer ${gerarToken(admin)}`)
      .send({ usuario_id: aluno.id, plano_id: plano.id });

    expect(res.status).toBe(201);
    expect(catracaService.sincronizarAluno).not.toHaveBeenCalled();

    await pool.query('DELETE FROM pagamentos WHERE matricula_id = $1', [res.body.id]);
    await pool.query('DELETE FROM matriculas WHERE id = $1', [res.body.id]);
    await pool.query('DELETE FROM planos WHERE id = $1', [plano.id]);
    await pool.query('DELETE FROM usuarios WHERE id = ANY($1)', [[admin.id, aluno.id]]);
  });

  test('não falha a criação da matrícula quando a catraca está offline', async () => {
    catracaService.sincronizarAluno.mockRejectedValue(new Error('Catraca catraca1 inacessível'));
    catracaService.liberarAcesso.mockResolvedValue(undefined);

    const admin = await criarUsuario({ role: 'admin' });
    const aluno = await criarUsuario({ role: 'aluno' });
    const plano = await criarPlano({ nome: 'Plano Admin Matricula Catraca Offline Teste' });

    const res = await request(app)
      .post('/api/admin/matriculas')
      .set('Authorization', `Bearer ${gerarToken(admin)}`)
      .send({ usuario_id: aluno.id, plano_id: plano.id, metodo_pagamento: 'dinheiro' });

    expect(res.status).toBe(201);

    await pool.query('DELETE FROM pagamentos WHERE matricula_id = $1', [res.body.id]);
    await pool.query('DELETE FROM matriculas WHERE id = $1', [res.body.id]);
    await pool.query('DELETE FROM planos WHERE id = $1', [plano.id]);
    await pool.query('DELETE FROM usuarios WHERE id = ANY($1)', [[admin.id, aluno.id]]);
  });
});
```

- [ ] **Step 3: Rodar os testes e confirmar que falham**

Run: `cd backend && npx jest routes/admin.test.js -t "integração com a catraca"`
Expected: FAIL — `catracaService.sincronizarAluno` nunca foi chamado (o hook ainda não existe no route handler).

- [ ] **Step 4: Implementar o hook em `admin.js`**

Em `backend/src/routes/admin.js`, adicionar os imports que faltam logo após a linha 4 (`const xpService = require('../services/xpService');`):

```javascript
const catracaService = require('../services/catracaService');
const logger = require('../utils/logger');
```

Depois, dentro do handler `POST /matriculas` (por volta da linha 281-292), o
bloco `if (statusMatricula === 'ativa') { ... }` hoje termina assim:

```javascript
    if (statusMatricula === 'ativa') {
      await xpService.adicionarXP(usuario_id, 100, 'matricula');
      const { rows: [indicacao] } = await pool.query(
        `UPDATE indicacoes SET status = 'convertido', convertido_em = NOW()
         WHERE indicado_id = $1 AND status = 'pendente'
         RETURNING indicador_id`,
        [usuario_id]
      );
      if (indicacao) {
        await xpService.adicionarXP(indicacao.indicador_id, 200, 'indicacao');
      }
    }
```

Substituir por (adiciona o hook de catraca no fim do mesmo bloco):

```javascript
    if (statusMatricula === 'ativa') {
      await xpService.adicionarXP(usuario_id, 100, 'matricula');
      const { rows: [indicacao] } = await pool.query(
        `UPDATE indicacoes SET status = 'convertido', convertido_em = NOW()
         WHERE indicado_id = $1 AND status = 'pendente'
         RETURNING indicador_id`,
        [usuario_id]
      );
      if (indicacao) {
        await xpService.adicionarXP(indicacao.indicador_id, 200, 'indicacao');
      }

      try {
        await catracaService.sincronizarAluno(usuario_id);
        await catracaService.liberarAcesso(usuario_id);
      } catch (err) {
        logger.error('catraca.sincronizarAluno/liberarAcesso falhou', { usuarioId: usuario_id, erro: err.message });
      }
    }
```

- [ ] **Step 5: Rodar os testes de novo e confirmar que passam**

Run: `cd backend && npx jest routes/admin.test.js`
Expected: PASS (todos os testes do arquivo, incluindo o describe já existente de financeiro).

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/admin.js backend/src/routes/admin.test.js
git commit -m "$(cat <<'EOF'
fix(admin): sincroniza aluno com a catraca ao criar matricula pelo painel

POST /api/admin/matriculas nunca chamava catracaService.sincronizarAluno/
liberarAcesso, so os fluxos de auto-matricula e pagamento faziam isso.
Um aluno matriculado pelo admin com pagamento na hora nunca chegava a
existir na catraca. Aproveita e corrige o escopo do afterAll(pool.end())
em admin.test.js, que estava soltando o pool cedo demais pro proximo
describe do arquivo.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: `catracaService.verificarRostoCadastrado` — confirmar cadastro facial direto no equipamento

**Files:**
- Modify: `backend/src/services/catracaService.js`
- Modify: `backend/src/services/catracaService.test.js`

**Interfaces:**
- Consumes: `catracasConfiguradas()` (`./catraca/config`), `client.loadObjects(object, opts)` — já existe em `controlIdClient.js:57-60`, `estaAtiva()` — já existe no próprio arquivo.
- Produces: `verificarRostoCadastrado(usuarioId): Promise<{ catraca: string, encontrado: boolean }[]>` — usado pela Task 3.

- [ ] **Step 1: Escrever os testes que falham**

Adicionar ao final de `backend/src/services/catracaService.test.js` (antes do
`describe('kill switch...')` ou depois, tanto faz — sugestão: logo após o
describe `reconciliar`):

```javascript
describe('verificarRostoCadastrado', () => {
  async function limpar(usuarioId) {
    await pool.query('DELETE FROM catraca_usuarios WHERE usuario_id = $1', [usuarioId]);
    await pool.query('DELETE FROM usuarios WHERE id = $1', [usuarioId]);
  }

  test('marca sincronizado quando encontra rosto cadastrado no equipamento', async () => {
    const client = clienteFalso();
    client.loadObjects = jest.fn(async (object) => (object === 'user_faces' ? [{ id: 1 }] : []));
    catracasConfiguradas.mockReturnValue([client]);

    const aluno = await criarUsuario({ nome: 'Aluno Verificar Rosto' });
    await pool.query(
      `INSERT INTO catraca_usuarios (usuario_id, catraca, catraca_user_id, face_status) VALUES ($1, 'catraca1', 950, 'pendente_presencial')`,
      [aluno.id]
    );

    const resultado = await catracaService.verificarRostoCadastrado(aluno.id);

    expect(resultado).toEqual([{ catraca: 'catraca1', encontrado: true }]);
    const { rows: [mapeamento] } = await pool.query('SELECT face_status FROM catraca_usuarios WHERE usuario_id = $1', [aluno.id]);
    expect(mapeamento.face_status).toBe('sincronizado');

    await limpar(aluno.id);
  });

  test('retorna encontrado: false quando o equipamento ainda não tem rosto cadastrado', async () => {
    const client = clienteFalso();
    catracasConfiguradas.mockReturnValue([client]);

    const aluno = await criarUsuario({ nome: 'Aluno Sem Rosto Ainda' });
    await pool.query(
      `INSERT INTO catraca_usuarios (usuario_id, catraca, catraca_user_id, face_status) VALUES ($1, 'catraca1', 951, 'pendente_presencial')`,
      [aluno.id]
    );

    const resultado = await catracaService.verificarRostoCadastrado(aluno.id);

    expect(resultado).toEqual([{ catraca: 'catraca1', encontrado: false }]);
    const { rows: [mapeamento] } = await pool.query('SELECT face_status FROM catraca_usuarios WHERE usuario_id = $1', [aluno.id]);
    expect(mapeamento.face_status).toBe('pendente_presencial');

    await limpar(aluno.id);
  });

  test('ignora catraca onde o aluno ainda não foi sincronizado', async () => {
    const client = clienteFalso();
    catracasConfiguradas.mockReturnValue([client]);

    const aluno = await criarUsuario({ nome: 'Aluno Nunca Sincronizado Rosto' });

    const resultado = await catracaService.verificarRostoCadastrado(aluno.id);

    expect(resultado).toEqual([]);
    expect(client.loadObjects).not.toHaveBeenCalled();

    await limpar(aluno.id);
  });
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `cd backend && npx jest services/catracaService.test.js -t "verificarRostoCadastrado"`
Expected: FAIL — `catracaService.verificarRostoCadastrado is not a function`.

- [ ] **Step 3: Implementar `verificarRostoCadastrado`**

Em `backend/src/services/catracaService.js`, adicionar a função logo depois
de `reconciliar` (antes de `module.exports`):

```javascript
async function verificarRostoCadastrado(usuarioId) {
  if (!(await estaAtiva())) return [];

  const resultados = [];
  for (const client of catracasConfiguradas()) {
    const { rows: [mapeamento] } = await pool.query(
      'SELECT catraca_user_id, face_status FROM catraca_usuarios WHERE usuario_id = $1 AND catraca = $2',
      [usuarioId, client.nome]
    );
    if (!mapeamento) continue;

    const faces = await client.loadObjects('user_faces', {
      fields: ['id'],
      where: { user_faces: { user_id: mapeamento.catraca_user_id } },
    });
    const encontrado = faces.length > 0;

    if (encontrado && mapeamento.face_status !== 'sincronizado') {
      await pool.query(
        'UPDATE catraca_usuarios SET face_status = $1, updated_at = NOW() WHERE usuario_id = $2 AND catraca = $3',
        ['sincronizado', usuarioId, client.nome]
      );
    }

    resultados.push({ catraca: client.nome, encontrado });
  }
  return resultados;
}
```

E adicionar `verificarRostoCadastrado,` ao `module.exports` no final do arquivo.

- [ ] **Step 4: Rodar os testes de novo e confirmar que passam**

Run: `cd backend && npx jest services/catracaService.test.js`
Expected: PASS (arquivo inteiro, incluindo os describes já existentes).

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/catracaService.js backend/src/services/catracaService.test.js
git commit -m "$(cat <<'EOF'
feat(catraca): verificarRostoCadastrado confirma cadastro facial no equipamento

Consulta user_faces na API da Control iD pro catraca_user_id do aluno;
se encontrar, marca face_status = sincronizado. Nome do objeto
user_faces ainda nao testado contra o equipamento real (mesmo risco
assumido pelo resto da integracao).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Endpoint `POST /api/catraca/:usuarioId/verificar-rosto`

**Files:**
- Modify: `backend/src/routes/catraca.js`
- Modify: `backend/src/routes/catraca.test.js`

**Interfaces:**
- Consumes: `catracaService.verificarRostoCadastrado(usuarioId)` (Task 2).
- Produces: `POST /api/catraca/:usuarioId/verificar-rosto` → `{ resultados: { catraca: string, encontrado: boolean }[] }`, usado pelo frontend na Task 4.

- [ ] **Step 1: Escrever o teste que falha**

Adicionar ao final de `backend/src/routes/catraca.test.js`:

```javascript
describe('POST /api/catraca/:usuarioId/verificar-rosto', () => {
  test('retorna o resultado por catraca', async () => {
    catracaService.verificarRostoCadastrado.mockResolvedValue([{ catraca: 'catraca1', encontrado: true }]);
    const admin = await criarUsuario({ role: 'admin' });
    const aluno = await criarUsuario({ role: 'aluno' });

    const res = await request(app)
      .post(`/api/catraca/${aluno.id}/verificar-rosto`)
      .set('Authorization', `Bearer ${gerarToken(admin)}`);

    expect(res.status).toBe(200);
    expect(res.body.resultados).toEqual([{ catraca: 'catraca1', encontrado: true }]);
    expect(catracaService.verificarRostoCadastrado).toHaveBeenCalledWith(aluno.id);

    await pool.query('DELETE FROM usuarios WHERE id = ANY($1)', [[admin.id, aluno.id]]);
  });

  test('rejeita aluno comum', async () => {
    const aluno = await criarUsuario({ role: 'aluno' });
    const res = await request(app)
      .post(`/api/catraca/${aluno.id}/verificar-rosto`)
      .set('Authorization', `Bearer ${gerarToken(aluno)}`);
    expect(res.status).toBe(403);
    await pool.query('DELETE FROM usuarios WHERE id = $1', [aluno.id]);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `cd backend && npx jest routes/catraca.test.js -t "verificar-rosto"`
Expected: FAIL — rota inexistente, `res.status` será 404.

- [ ] **Step 3: Implementar a rota**

Em `backend/src/routes/catraca.js`, adicionar depois da rota
`POST /:usuarioId/sincronizar` (antes de `module.exports = router;`):

```javascript
// POST /api/catraca/:usuarioId/verificar-rosto (admin/dono) — confirma cadastro facial feito direto no equipamento
router.post('/:usuarioId/verificar-rosto', authMiddleware, requireRole('admin', 'dono'), async (req, res, next) => {
  try {
    const resultados = await catracaService.verificarRostoCadastrado(Number(req.params.usuarioId));
    res.json({ resultados });
  } catch (err) {
    next(err);
  }
});
```

- [ ] **Step 4: Rodar os testes de novo e confirmar que passam**

Run: `cd backend && npx jest routes/catraca.test.js`
Expected: PASS (arquivo inteiro).

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/catraca.js backend/src/routes/catraca.test.js
git commit -m "$(cat <<'EOF'
feat(catraca): endpoint POST /api/catraca/:usuarioId/verificar-rosto

Expoe verificarRostoCadastrado pro botao "Verificar cadastro" do
assistente de adicionar aluno.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Frontend — botão "Adicionar aluno" + assistente de 3 passos

**Files:**
- Modify: `frontend/assets/css/admin.css` (novo bloco de estilos do wizard, após a linha 20)
- Modify: `frontend/admin/alunos.html` (botão em `.page-head`, novo `<dialog>`)
- Modify: `frontend/assets/js/admin-alunos.js` (lógica do assistente, ao final do arquivo)

**Interfaces:**
- Consumes: `POST /api/auth/registro`, `POST /api/admin/matriculas` (já usados por `formNovoCliente`, mesmo arquivo), `POST /api/catraca/:usuarioId/verificar-rosto` (Task 3), além de `carregarPlanos()`, `gerarSenhaTemp()`, `toast()`, `formatMoeda()` — todos já definidos/importados no mesmo arquivo/página.
- Produces: nada consumido por outro arquivo — é a ponta final do fluxo.

Não há framework de testes no frontend (confirmado durante o design da
iteração anterior de ícones/dashboard). Verificação é: `node --check` no JS
+ inspeção visual via Chrome DevTools MCP contra uma página de preview local
que mocka `api.get/post` (mesmo formato de verificação já usado nesta sessão
pro refino dos stat-cards do dashboard).

- [ ] **Step 1: CSS do indicador de passos**

Em `frontend/assets/css/admin.css`, inserir depois da linha 20
(`.admin-stat-cards span { ... }`) e antes do comentário
`/* ===== Gráfico simples de barras ... ===== */`:

```css
/* ===== Assistente "Adicionar aluno" (indicador de passos) ===== */
.wizard-steps { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 1.75rem; }
.wizard-step { display: flex; align-items: center; gap: 0.5rem; color: var(--color-muted); font-size: 0.82rem; font-weight: 600; }
.wizard-step::after { content: ''; width: 28px; height: 1px; background: var(--color-border); margin-left: 0.4rem; }
.wizard-step:last-child::after { display: none; }
.wizard-step-num {
  width: 24px; height: 24px; border-radius: 50%;
  background: var(--color-surface-2); border: 1px solid var(--color-border);
  display: flex; align-items: center; justify-content: center; font-size: 0.74rem;
}
.wizard-step.active { color: var(--color-text); }
.wizard-step.active .wizard-step-num { background: var(--color-primary); border-color: var(--color-primary); color: #fff; }
```

- [ ] **Step 2: Botão no `.page-head` + novo `<dialog>` em `alunos.html`**

Em `frontend/admin/alunos.html`, dentro de `.page-head` (linhas 28-34), o
bloco atual é:

```html
      <div class="page-head">
        <button class="btn btn-ghost btn-sm sidebar-toggle" id="btn-sidebar-toggle" data-icon="menu"></button>
        <div>
          <h1>Alunos</h1>
          <p>Gerencie a base de alunos matriculados.</p>
        </div>
      </div>
```

Substituir por (adiciona o botão como terceiro filho — `.page-head` já é
`justify-content: space-between`, então ele cai sozinho no canto superior
direito, mesmo padrão de `admin/planos.html`/`admin/equipe.html`/`admin/aulas.html`):

```html
      <div class="page-head">
        <button class="btn btn-ghost btn-sm sidebar-toggle" id="btn-sidebar-toggle" data-icon="menu"></button>
        <div>
          <h1>Alunos</h1>
          <p>Gerencie a base de alunos matriculados.</p>
        </div>
        <button class="btn btn-primary" id="btn-adicionar-aluno" data-role-adminup>
          <span data-icon="user-check" data-icon-size="16"></span>Adicionar aluno
        </button>
      </div>
```

Depois, adicionar um novo `<dialog>` logo após o `</dialog>` que fecha
`dialog-matricula` (linha 111) e antes dos `<script>` finais (linha 113):

```html
  <dialog id="dialog-adicionar-aluno" class="admin-dialog">
    <form id="form-adicionar-aluno" method="dialog">
      <div class="wizard-steps">
        <div class="wizard-step active" data-wizard-step="dados"><span class="wizard-step-num">1</span><span>Dados</span></div>
        <div class="wizard-step" data-wizard-step="plano"><span class="wizard-step-num">2</span><span>Plano</span></div>
        <div class="wizard-step" data-wizard-step="facial"><span class="wizard-step-num">3</span><span>Facial</span></div>
      </div>

      <section data-wizard-section="dados">
        <h2>Adicionar aluno</h2>

        <label class="field-label">Nome completo <span class="text-danger">*</span></label>
        <input type="text" id="aa-nome" class="input" placeholder="Nome do aluno" required />

        <label class="field-label" style="margin-top:1rem">E-mail <span class="text-danger">*</span></label>
        <input type="email" id="aa-email" class="input" placeholder="email@exemplo.com" required />

        <label class="field-label" style="margin-top:1rem">Telefone</label>
        <input type="tel" id="aa-telefone" class="input" placeholder="(00) 00000-0000" />

        <label class="field-label" style="margin-top:1rem">Senha temporária</label>
        <div class="row gap-sm">
          <input type="text" id="aa-senha" class="input" readonly style="flex:1" />
          <button type="button" class="btn btn-ghost btn-sm" id="btn-aa-copiar-senha" title="Copiar senha">
            <span data-icon="copy" data-icon-size="14"></span>
          </button>
        </div>
        <p class="text-muted" style="font-size:.78rem;margin-top:.35rem">Repasse essa senha ao aluno — ele pode trocá-la depois em "Esqueci minha senha".</p>

        <div class="dialog-actions">
          <button type="button" class="btn btn-ghost" id="btn-aa-cancel-1">Cancelar</button>
          <button type="button" class="btn btn-primary" id="btn-aa-avancar-dados">Avançar</button>
        </div>
      </section>

      <section data-wizard-section="plano" style="display:none">
        <h2>Escolher plano</h2>

        <label class="field-label">Plano</label>
        <select id="aa-plano" class="input" required></select>

        <label class="field-label" style="margin-top:1rem">Pagamento</label>
        <select id="aa-metodo" class="input">
          <option value="">Pendente (confirmar depois)</option>
          <option value="dinheiro">Dinheiro</option>
          <option value="pix">Pix</option>
          <option value="cartao">Cartão</option>
        </select>

        <div class="dialog-actions">
          <button type="button" class="btn btn-ghost" id="btn-aa-cancel-2">Cancelar</button>
          <button type="button" class="btn btn-primary" id="btn-aa-avancar-plano">Avançar</button>
        </div>
      </section>

      <section data-wizard-section="facial" style="display:none">
        <h2>Matrícula presencial?</h2>
        <p class="text-muted">Se o aluno estiver na academia agora, cadastre o rosto direto na catraca antes de concluir.</p>

        <label class="switch" style="margin-top:.75rem">
          <input type="checkbox" id="aa-presencial" />
          <span class="slider"></span>
        </label>
        <span style="margin-left:.6rem" id="aa-presencial-label">Não é presencial</span>

        <div id="aa-facial-painel" style="display:none;margin-top:1.25rem">
          <p>Leve o aluno até a catraca pra cadastrar o rosto pelo equipamento.</p>
          <button type="button" class="btn btn-ghost btn-sm" id="btn-aa-verificar-rosto">
            <span data-icon="shield-check" data-icon-size="14"></span>Verificar cadastro
          </button>
          <p class="text-muted" id="aa-facial-status" style="margin-top:.5rem"></p>
        </div>

        <div class="dialog-actions">
          <button type="submit" class="btn btn-primary" id="btn-aa-concluir">Concluir</button>
        </div>
      </section>
    </form>
  </dialog>
```

- [ ] **Step 3: Lógica do assistente em `admin-alunos.js`**

Adicionar ao final de `frontend/assets/js/admin-alunos.js`:

```javascript
// ===== Adicionar aluno (assistente com verificação facial) =====
const dialogAdicionarAluno = document.getElementById('dialog-adicionar-aluno');
const formAdicionarAluno = document.getElementById('form-adicionar-aluno');
const inputAaNome = document.getElementById('aa-nome');
const inputAaEmail = document.getElementById('aa-email');
const inputAaTelefone = document.getElementById('aa-telefone');
const inputAaSenha = document.getElementById('aa-senha');
const selAaPlano = document.getElementById('aa-plano');
const selAaMetodo = document.getElementById('aa-metodo');
const inputAaPresencial = document.getElementById('aa-presencial');
const labelAaPresencial = document.getElementById('aa-presencial-label');
const painelAaFacial = document.getElementById('aa-facial-painel');
const statusAaFacial = document.getElementById('aa-facial-status');

let aaUsuarioId = null;

function aaIrParaPasso(passo) {
  document.querySelectorAll('[data-wizard-step]').forEach((el) => {
    el.classList.toggle('active', el.dataset.wizardStep === passo);
  });
  document.querySelectorAll('[data-wizard-section]').forEach((el) => {
    el.style.display = el.dataset.wizardSection === passo ? '' : 'none';
  });
}

document.getElementById('btn-adicionar-aluno').addEventListener('click', () => {
  formAdicionarAluno.reset();
  aaUsuarioId = null;
  inputAaSenha.value = gerarSenhaTemp();
  painelAaFacial.style.display = 'none';
  statusAaFacial.textContent = '';
  labelAaPresencial.textContent = 'Não é presencial';
  aaIrParaPasso('dados');
  dialogAdicionarAluno.showModal();
});

document.getElementById('btn-aa-copiar-senha').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(inputAaSenha.value);
    toast('Senha copiada.', 'success');
  } catch {
    toast('Não foi possível copiar. Copie manualmente.', 'error');
  }
});

document.getElementById('btn-aa-cancel-1').addEventListener('click', () => dialogAdicionarAluno.close());
document.getElementById('btn-aa-cancel-2').addEventListener('click', () => dialogAdicionarAluno.close());

document.getElementById('btn-aa-avancar-dados').addEventListener('click', async (ev) => {
  const btn = ev.currentTarget;
  if (!inputAaNome.value.trim() || !inputAaEmail.value.trim()) {
    toast('Preencha nome e e-mail.', 'error');
    return;
  }
  btn.disabled = true;
  btn.textContent = 'Cadastrando...';
  try {
    const { user } = await api.post('/api/auth/registro', {
      nome: inputAaNome.value.trim(),
      email: inputAaEmail.value.trim(),
      senha: inputAaSenha.value,
      telefone: inputAaTelefone.value.trim(),
    });
    aaUsuarioId = user.id;

    const planos = await carregarPlanos();
    selAaPlano.innerHTML = planos.map((p) => `<option value="${p.id}">${p.nome} (${formatMoeda(p.preco_mensal)}/mês)</option>`).join('');
    selAaMetodo.value = '';

    aaIrParaPasso('plano');
  } catch (err) {
    toast(err.message || 'Erro ao cadastrar aluno.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Avançar';
  }
});

document.getElementById('btn-aa-avancar-plano').addEventListener('click', async (ev) => {
  const btn = ev.currentTarget;
  btn.disabled = true;
  btn.textContent = 'Salvando...';
  try {
    await api.post('/api/admin/matriculas', {
      usuario_id: aaUsuarioId,
      plano_id: selAaPlano.value,
      metodo_pagamento: selAaMetodo.value || undefined,
    });

    inputAaPresencial.checked = false;
    labelAaPresencial.textContent = 'Não é presencial';
    painelAaFacial.style.display = 'none';
    statusAaFacial.textContent = '';

    aaIrParaPasso('facial');
  } catch (err) {
    toast(err.message || 'Erro ao matricular aluno.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Avançar';
  }
});

inputAaPresencial.addEventListener('change', () => {
  painelAaFacial.style.display = inputAaPresencial.checked ? '' : 'none';
  labelAaPresencial.textContent = inputAaPresencial.checked ? 'Presencial' : 'Não é presencial';
});

document.getElementById('btn-aa-verificar-rosto').addEventListener('click', async (ev) => {
  const btn = ev.currentTarget;
  btn.disabled = true;
  statusAaFacial.textContent = 'Verificando...';
  try {
    const { resultados } = await api.post(`/api/catraca/${aaUsuarioId}/verificar-rosto`, {});
    const encontrou = resultados.some((r) => r.encontrado);
    statusAaFacial.textContent = encontrou
      ? 'Rosto cadastrado com sucesso!'
      : 'Ainda não encontramos o cadastro — cadastre o rosto no equipamento e tente de novo.';
  } catch (err) {
    statusAaFacial.textContent = err.message || 'Erro ao verificar cadastro.';
  } finally {
    btn.disabled = false;
  }
});

formAdicionarAluno.addEventListener('submit', (ev) => {
  ev.preventDefault();
  dialogAdicionarAluno.close();
  toast('Aluno adicionado com sucesso!', 'success');
  carregarAlunos(document.getElementById('busca-aluno').value.trim(), paginaAtual);
});
```

- [ ] **Step 4: Validar sintaxe**

Run: `node --check frontend/assets/js/admin-alunos.js`
Expected: nenhum output (sintaxe válida).

- [ ] **Step 5: Verificação visual — preview com `api` mockado**

Criar um arquivo temporário (não commitado) `frontend/admin/_preview-adicionar-aluno.html`:

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
  <link rel="stylesheet" href="../assets/css/global.css" />
  <link rel="stylesheet" href="../assets/css/admin.css" />
  <style>body{background:var(--color-bg);padding:2rem;}</style>
</head>
<body>
  <div class="page-head">
    <div><h1>Alunos</h1><p>Preview do assistente</p></div>
    <button class="btn btn-primary" id="btn-adicionar-aluno"><span data-icon="user-check" data-icon-size="16"></span>Adicionar aluno</button>
  </div>

  <dialog id="dialog-adicionar-aluno" class="admin-dialog">
    <form id="form-adicionar-aluno" method="dialog">
      <div class="wizard-steps">
        <div class="wizard-step active" data-wizard-step="dados"><span class="wizard-step-num">1</span><span>Dados</span></div>
        <div class="wizard-step" data-wizard-step="plano"><span class="wizard-step-num">2</span><span>Plano</span></div>
        <div class="wizard-step" data-wizard-step="facial"><span class="wizard-step-num">3</span><span>Facial</span></div>
      </div>

      <section data-wizard-section="dados">
        <h2>Adicionar aluno</h2>
        <label class="field-label">Nome completo <span class="text-danger">*</span></label>
        <input type="text" id="aa-nome" class="input" placeholder="Nome do aluno" required />
        <label class="field-label" style="margin-top:1rem">E-mail <span class="text-danger">*</span></label>
        <input type="email" id="aa-email" class="input" placeholder="email@exemplo.com" required />
        <label class="field-label" style="margin-top:1rem">Telefone</label>
        <input type="tel" id="aa-telefone" class="input" placeholder="(00) 00000-0000" />
        <label class="field-label" style="margin-top:1rem">Senha temporária</label>
        <div class="row gap-sm">
          <input type="text" id="aa-senha" class="input" readonly style="flex:1" />
          <button type="button" class="btn btn-ghost btn-sm" id="btn-aa-copiar-senha" title="Copiar senha">
            <span data-icon="copy" data-icon-size="14"></span>
          </button>
        </div>
        <div class="dialog-actions">
          <button type="button" class="btn btn-ghost" id="btn-aa-cancel-1">Cancelar</button>
          <button type="button" class="btn btn-primary" id="btn-aa-avancar-dados">Avançar</button>
        </div>
      </section>

      <section data-wizard-section="plano" style="display:none">
        <h2>Escolher plano</h2>
        <label class="field-label">Plano</label>
        <select id="aa-plano" class="input" required></select>
        <label class="field-label" style="margin-top:1rem">Pagamento</label>
        <select id="aa-metodo" class="input">
          <option value="">Pendente (confirmar depois)</option>
          <option value="dinheiro">Dinheiro</option>
          <option value="pix">Pix</option>
          <option value="cartao">Cartão</option>
        </select>
        <div class="dialog-actions">
          <button type="button" class="btn btn-ghost" id="btn-aa-cancel-2">Cancelar</button>
          <button type="button" class="btn btn-primary" id="btn-aa-avancar-plano">Avançar</button>
        </div>
      </section>

      <section data-wizard-section="facial" style="display:none">
        <h2>Matrícula presencial?</h2>
        <p class="text-muted">Se o aluno estiver na academia agora, cadastre o rosto direto na catraca antes de concluir.</p>
        <label class="switch" style="margin-top:.75rem">
          <input type="checkbox" id="aa-presencial" />
          <span class="slider"></span>
        </label>
        <span style="margin-left:.6rem" id="aa-presencial-label">Não é presencial</span>
        <div id="aa-facial-painel" style="display:none;margin-top:1.25rem">
          <p>Leve o aluno até a catraca pra cadastrar o rosto pelo equipamento.</p>
          <button type="button" class="btn btn-ghost btn-sm" id="btn-aa-verificar-rosto">
            <span data-icon="shield-check" data-icon-size="14"></span>Verificar cadastro
          </button>
          <p class="text-muted" id="aa-facial-status" style="margin-top:.5rem"></p>
        </div>
        <div class="dialog-actions">
          <button type="submit" class="btn btn-primary" id="btn-aa-concluir">Concluir</button>
        </div>
      </section>
    </form>
  </dialog>

  <script src="../assets/js/icons.js"></script>
  <script>
    let planoMock = [{ id: 1, nome: 'Mensal', preco_mensal: 150 }];
    window.api = {
      post: async (path, body) => {
        console.log('POST', path, body);
        if (path === '/api/auth/registro') return { user: { id: 42, nome: body.nome } };
        if (path === '/api/admin/matriculas') return { id: 7 };
        if (path.includes('/verificar-rosto')) return { resultados: [{ catraca: 'catraca1', encontrado: false }] };
      },
      get: async () => planoMock,
    };
    function toast(msg) { console.log('toast:', msg); }
    function formatMoeda(v) { return `R$ ${Number(v).toFixed(2)}`; }
    function gerarSenhaTemp() { return 'AbC123xy'; }
    async function carregarPlanos() { return planoMock; }
    function carregarAlunos() {}
    let paginaAtual = 1;
  </script>
  <script src="_preview-wizard.js"></script>
</body>
</html>
```

Criar também `frontend/admin/_preview-wizard.js` (temporário) com exatamente
este conteúdo (idêntico ao bloco do Step 3 acima, sem a linha
`document.getElementById('busca-aluno').value.trim()` no final — o preview
não tem campo de busca, então o `submit` fica só com `''`):

```javascript
const dialogAdicionarAluno = document.getElementById('dialog-adicionar-aluno');
const formAdicionarAluno = document.getElementById('form-adicionar-aluno');
const inputAaNome = document.getElementById('aa-nome');
const inputAaEmail = document.getElementById('aa-email');
const inputAaTelefone = document.getElementById('aa-telefone');
const inputAaSenha = document.getElementById('aa-senha');
const selAaPlano = document.getElementById('aa-plano');
const selAaMetodo = document.getElementById('aa-metodo');
const inputAaPresencial = document.getElementById('aa-presencial');
const labelAaPresencial = document.getElementById('aa-presencial-label');
const painelAaFacial = document.getElementById('aa-facial-painel');
const statusAaFacial = document.getElementById('aa-facial-status');

let aaUsuarioId = null;

function aaIrParaPasso(passo) {
  document.querySelectorAll('[data-wizard-step]').forEach((el) => {
    el.classList.toggle('active', el.dataset.wizardStep === passo);
  });
  document.querySelectorAll('[data-wizard-section]').forEach((el) => {
    el.style.display = el.dataset.wizardSection === passo ? '' : 'none';
  });
}

document.getElementById('btn-adicionar-aluno').addEventListener('click', () => {
  formAdicionarAluno.reset();
  aaUsuarioId = null;
  inputAaSenha.value = gerarSenhaTemp();
  painelAaFacial.style.display = 'none';
  statusAaFacial.textContent = '';
  labelAaPresencial.textContent = 'Não é presencial';
  aaIrParaPasso('dados');
  dialogAdicionarAluno.showModal();
});

document.getElementById('btn-aa-copiar-senha').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(inputAaSenha.value);
    toast('Senha copiada.', 'success');
  } catch {
    toast('Não foi possível copiar. Copie manualmente.', 'error');
  }
});

document.getElementById('btn-aa-cancel-1').addEventListener('click', () => dialogAdicionarAluno.close());
document.getElementById('btn-aa-cancel-2').addEventListener('click', () => dialogAdicionarAluno.close());

document.getElementById('btn-aa-avancar-dados').addEventListener('click', async (ev) => {
  const btn = ev.currentTarget;
  if (!inputAaNome.value.trim() || !inputAaEmail.value.trim()) {
    toast('Preencha nome e e-mail.', 'error');
    return;
  }
  btn.disabled = true;
  btn.textContent = 'Cadastrando...';
  try {
    const { user } = await api.post('/api/auth/registro', {
      nome: inputAaNome.value.trim(),
      email: inputAaEmail.value.trim(),
      senha: inputAaSenha.value,
      telefone: inputAaTelefone.value.trim(),
    });
    aaUsuarioId = user.id;

    const planos = await carregarPlanos();
    selAaPlano.innerHTML = planos.map((p) => `<option value="${p.id}">${p.nome} (${formatMoeda(p.preco_mensal)}/mês)</option>`).join('');
    selAaMetodo.value = '';

    aaIrParaPasso('plano');
  } catch (err) {
    toast(err.message || 'Erro ao cadastrar aluno.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Avançar';
  }
});

document.getElementById('btn-aa-avancar-plano').addEventListener('click', async (ev) => {
  const btn = ev.currentTarget;
  btn.disabled = true;
  btn.textContent = 'Salvando...';
  try {
    await api.post('/api/admin/matriculas', {
      usuario_id: aaUsuarioId,
      plano_id: selAaPlano.value,
      metodo_pagamento: selAaMetodo.value || undefined,
    });

    inputAaPresencial.checked = false;
    labelAaPresencial.textContent = 'Não é presencial';
    painelAaFacial.style.display = 'none';
    statusAaFacial.textContent = '';

    aaIrParaPasso('facial');
  } catch (err) {
    toast(err.message || 'Erro ao matricular aluno.', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Avançar';
  }
});

inputAaPresencial.addEventListener('change', () => {
  painelAaFacial.style.display = inputAaPresencial.checked ? '' : 'none';
  labelAaPresencial.textContent = inputAaPresencial.checked ? 'Presencial' : 'Não é presencial';
});

document.getElementById('btn-aa-verificar-rosto').addEventListener('click', async (ev) => {
  const btn = ev.currentTarget;
  btn.disabled = true;
  statusAaFacial.textContent = 'Verificando...';
  try {
    const { resultados } = await api.post(`/api/catraca/${aaUsuarioId}/verificar-rosto`, {});
    const encontrou = resultados.some((r) => r.encontrado);
    statusAaFacial.textContent = encontrou
      ? 'Rosto cadastrado com sucesso!'
      : 'Ainda não encontramos o cadastro — cadastre o rosto no equipamento e tente de novo.';
  } catch (err) {
    statusAaFacial.textContent = err.message || 'Erro ao verificar cadastro.';
  } finally {
    btn.disabled = false;
  }
});

formAdicionarAluno.addEventListener('submit', (ev) => {
  ev.preventDefault();
  dialogAdicionarAluno.close();
  toast('Aluno adicionado com sucesso!', 'success');
});
```

Subir localmente (`npx serve frontend -l 3000`), navegar pra
`http://localhost:3000/admin/_preview-adicionar-aluno.html` via Chrome
DevTools MCP, clicar em "Adicionar aluno", preencher nome/e-mail, avançar,
escolher plano, avançar, ligar o toggle "presencial", clicar em "Verificar
cadastro" — tirar screenshot em cada passo confirmando:
- Indicador de passos avança (bolinha ativa muda de 1→2→3).
- Botão "Adicionar aluno" aparece no canto superior direito da `.page-head`.
- Toggle mostra/esconde o painel de verificação corretamente.
- Mensagem de "não encontramos o cadastro" aparece (mock retorna `encontrado: false`).

Depois, apagar `_preview-adicionar-aluno.html` e `_preview-wizard.js`
(`rm frontend/admin/_preview-adicionar-aluno.html frontend/admin/_preview-wizard.js`)
e confirmar com `git status` que não sobrou nada — mesmo processo já usado
nesta sessão pra validar o CSS dos stat-cards.

- [ ] **Step 6: Commit**

```bash
git add frontend/assets/css/admin.css frontend/admin/alunos.html frontend/assets/js/admin-alunos.js
git commit -m "$(cat <<'EOF'
feat(alunos): assistente "Adicionar aluno" com verificacao de cadastro facial

Botao novo no canto superior direito da pagina Alunos (separado do
"Novo Cliente" existente), assistente de 3 passos: dados, plano,
verificacao facial (consulta o endpoint novo de verificar-rosto quando
a matricula e presencial).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```
