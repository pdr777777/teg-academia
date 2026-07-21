# Painel do Aluno no Admin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reorganizar a fileira de alunos do admin (um botão só, chavinha com rótulo + botão único "Mais opções"), consertar o vínculo real da chavinha com a catraca, criar o painel de detalhe do aluno (dados + frequência de 30 dias + exclusão soft-delete), e adicionar foto de perfil + apelido sincronizados entre o app/site do aluno e o admin.

**Architecture:** Backend Express/Postgres com testes Jest/Supertest contra banco real (mesmo padrão já usado no resto do projeto). Frontend HTML/CSS/JS vanilla sem build step. Upload de foto usa Supabase Storage via `@supabase/supabase-js` (dependência nova) + `multer` (dependência nova, só pra parsing de multipart no Express).

**Tech Stack:** Node.js/Express/Postgres/Jest (backend), HTML/CSS/JS vanilla (frontend), Supabase Storage (novo).

## Global Constraints

- `usuarios.ativo` continua sendo só a chavinha manual (liga/desliga acesso, reversível). Exclusão usa uma coluna nova e separada (`excluido_em`) — não reaproveita `ativo`, pra não conflitar bloqueio temporário com remoção da lista.
- Exclusão nunca é um `DELETE` físico — as constraints `ON DELETE RESTRICT` de `matriculas`/`pagamentos` (migration 016) continuam intocadas.
- Sem foto/apelido editável pelo admin nesta entrega — só leitura no painel; edição continua sendo self-service do aluno.
- Novas env vars necessárias (documentar em `backend/.env.example`): `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.

---

## Task 1: Migration — `excluido_em` e `apelido`

**Files:**
- Create: `database/migrations/032_usuarios_exclusao_apelido.sql`

**Interfaces:**
- Produces: colunas `usuarios.excluido_em TIMESTAMPTZ` (NULL = não excluído) e `usuarios.apelido VARCHAR(60)`, usadas pelas Tasks 3, 5, 6.

- [ ] **Step 1: Criar a migration**

```sql
-- Exclusao logica de aluno (distinta de `ativo`, que e a chavinha manual de
-- bloqueio/liberacao de acesso na catraca) e apelido de exibicao editavel
-- pelo proprio aluno.
ALTER TABLE usuarios ADD COLUMN excluido_em TIMESTAMPTZ;
ALTER TABLE usuarios ADD COLUMN apelido VARCHAR(60);
```

- [ ] **Step 2: Rodar a migration no banco de teste/dev**

Run: `cd backend && npm run migrate`
Expected: log confirmando `032_usuarios_exclusao_apelido.sql` aplicada, sem erro.

- [ ] **Step 3: Commit**

```bash
git add database/migrations/032_usuarios_exclusao_apelido.sql
git commit -m "$(cat <<'EOF'
feat(db): adiciona excluido_em e apelido em usuarios

excluido_em e distinto de ativo de proposito: ativo e a chavinha manual
de acesso (reversivel, aluno continua na lista), excluido_em e soft-delete
que esconde o aluno da listagem sem perder historico financeiro.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Chavinha vinculada de verdade à catraca

**Files:**
- Modify: `backend/src/routes/admin.js:179-190`
- Modify: `backend/src/routes/admin.test.js`

**Interfaces:**
- Consumes: `catracaService.liberarAcesso(usuarioId)` / `catracaService.bloquearAcesso(usuarioId)` (já existem, mesma assinatura usada em `matriculas.js:50-51`).
- Produces: nenhuma interface nova — só corrige o comportamento de `PATCH /api/admin/alunos/:id/toggle`.

- [ ] **Step 1: Escrever os testes que falham**

Adicionar ao final de `backend/src/routes/admin.test.js`:

```javascript
describe('PATCH /api/admin/alunos/:id/toggle — integração com a catraca', () => {
  beforeEach(() => {
    catracaService.liberarAcesso.mockReset();
    catracaService.bloquearAcesso.mockReset();
  });

  test('libera acesso na catraca quando a chavinha liga (ativo: false -> true)', async () => {
    catracaService.liberarAcesso.mockResolvedValue(undefined);
    const admin = await criarUsuario({ role: 'admin' });
    const aluno = await criarUsuario({ role: 'aluno' });
    await pool.query('UPDATE usuarios SET ativo = FALSE WHERE id = $1', [aluno.id]);

    const res = await request(app)
      .patch(`/api/admin/alunos/${aluno.id}/toggle`)
      .set('Authorization', `Bearer ${gerarToken(admin)}`);

    expect(res.status).toBe(200);
    expect(res.body.ativo).toBe(true);
    expect(catracaService.liberarAcesso).toHaveBeenCalledWith(aluno.id);
    expect(catracaService.bloquearAcesso).not.toHaveBeenCalled();

    await pool.query('DELETE FROM usuarios WHERE id = ANY($1)', [[admin.id, aluno.id]]);
  });

  test('bloqueia acesso na catraca quando a chavinha desliga (ativo: true -> false)', async () => {
    catracaService.bloquearAcesso.mockResolvedValue(undefined);
    const admin = await criarUsuario({ role: 'admin' });
    const aluno = await criarUsuario({ role: 'aluno' });

    const res = await request(app)
      .patch(`/api/admin/alunos/${aluno.id}/toggle`)
      .set('Authorization', `Bearer ${gerarToken(admin)}`);

    expect(res.status).toBe(200);
    expect(res.body.ativo).toBe(false);
    expect(catracaService.bloquearAcesso).toHaveBeenCalledWith(aluno.id);
    expect(catracaService.liberarAcesso).not.toHaveBeenCalled();

    await pool.query('DELETE FROM usuarios WHERE id = ANY($1)', [[admin.id, aluno.id]]);
  });

  test('não falha o toggle quando a catraca está offline', async () => {
    catracaService.bloquearAcesso.mockRejectedValue(new Error('Catraca catraca1 inacessível'));
    const admin = await criarUsuario({ role: 'admin' });
    const aluno = await criarUsuario({ role: 'aluno' });

    const res = await request(app)
      .patch(`/api/admin/alunos/${aluno.id}/toggle`)
      .set('Authorization', `Bearer ${gerarToken(admin)}`);

    expect(res.status).toBe(200);

    await pool.query('DELETE FROM usuarios WHERE id = ANY($1)', [[admin.id, aluno.id]]);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falham**

Run: `cd backend && NODE_ENV=test npx jest routes/admin.test.js -t "chavinha"`
Expected: FAIL — `catracaService.liberarAcesso`/`bloquearAcesso` nunca chamados.

- [ ] **Step 3: Implementar**

Em `backend/src/routes/admin.js`, substituir o handler (linhas 179-190):

```javascript
router.patch('/alunos/:id/toggle', authMiddleware, requireRole('admin', 'dono'), async (req, res, next) => {
  try {
    const { rows: [user] } = await pool.query(
      'UPDATE usuarios SET ativo = NOT ativo, updated_at = NOW() WHERE id = $1 RETURNING id, nome, ativo',
      [req.params.id]
    );
    if (!user) return res.status(404).json({ error: 'Aluno não encontrado' });

    try {
      if (user.ativo) await catracaService.liberarAcesso(user.id);
      else await catracaService.bloquearAcesso(user.id);
    } catch (err) {
      logger.error('catraca.liberarAcesso/bloquearAcesso falhou (toggle)', { usuarioId: user.id, erro: err.message });
    }

    res.json(user);
  } catch (err) {
    next(err);
  }
});
```

- [ ] **Step 4: Rodar de novo e confirmar que passam**

Run: `cd backend && NODE_ENV=test npx jest routes/admin.test.js`
Expected: PASS (arquivo inteiro).

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/admin.js backend/src/routes/admin.test.js
git commit -m "$(cat <<'EOF'
fix(admin): chavinha de acesso agora libera/bloqueia na catraca de verdade

PATCH /api/admin/alunos/:id/toggle so mudava usuarios.ativo e nunca
falava com a catraca - desligar a chavinha nao bloqueava ninguem de
verdade. Corrigido com o mesmo padrao try/catch+logger.error ja usado
nos outros ganchos de catraca.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: `GET /api/admin/alunos/:id` — detalhe do aluno

**Files:**
- Modify: `backend/src/routes/admin.js` (nova rota, depois da rota `GET /alunos` em `admin.js:146-176`)
- Modify: `backend/src/routes/admin.test.js`

**Interfaces:**
- Produces: `GET /api/admin/alunos/:id` → `{ id, nome, email, telefone, cpf, apelido, foto_url, ativo, controlid_user_id, matricula_id, matricula_status, data_vencimento, plano_nome, ultima_mensalidade }`. Consumido pela Task 9 (frontend).

- [ ] **Step 1: Escrever os testes que falham**

Adicionar ao final de `backend/src/routes/admin.test.js`:

```javascript
describe('GET /api/admin/alunos/:id — detalhe', () => {
  test('retorna dados completos, plano ativo e ultima mensalidade paga', async () => {
    const admin = await criarUsuario({ role: 'admin' });
    const aluno = await criarUsuario({ nome: 'Aluno Detalhe', role: 'aluno' });
    await pool.query(
      `UPDATE usuarios SET cpf = $1, apelido = $2, telefone = $3 WHERE id = $4`,
      ['11122233344', 'Alunão', '67988887777', aluno.id]
    );
    const plano = await criarPlano({ nome: 'Plano Detalhe Teste' });
    const matricula = await criarMatricula({ usuario_id: aluno.id, plano_id: plano.id, status: 'ativa' });
    const pagamentoAntigo = new Date(Date.now() - 40 * 86400000);
    const pagamentoRecente = new Date(Date.now() - 2 * 86400000);
    await pool.query(
      `INSERT INTO pagamentos (matricula_id, usuario_id, valor, status, data_pagamento) VALUES ($1, $2, 100, 'pago', $3)`,
      [matricula.id, aluno.id, pagamentoAntigo]
    );
    await pool.query(
      `INSERT INTO pagamentos (matricula_id, usuario_id, valor, status, data_pagamento) VALUES ($1, $2, 100, 'pago', $3)`,
      [matricula.id, aluno.id, pagamentoRecente]
    );

    const res = await request(app)
      .get(`/api/admin/alunos/${aluno.id}`)
      .set('Authorization', `Bearer ${gerarToken(admin)}`);

    expect(res.status).toBe(200);
    expect(res.body.nome).toBe('Aluno Detalhe');
    expect(res.body.cpf).toBe('11122233344');
    expect(res.body.apelido).toBe('Alunão');
    expect(res.body.plano_nome).toBe('Plano Detalhe Teste');
    expect(res.body.matricula_status).toBe('ativa');
    expect(new Date(res.body.ultima_mensalidade).toDateString()).toBe(pagamentoRecente.toDateString());

    await pool.query('DELETE FROM pagamentos WHERE matricula_id = $1', [matricula.id]);
    await pool.query('DELETE FROM matriculas WHERE id = $1', [matricula.id]);
    await pool.query('DELETE FROM planos WHERE id = $1', [plano.id]);
    await pool.query('DELETE FROM usuarios WHERE id = ANY($1)', [[admin.id, aluno.id]]);
  });

  test('404 quando o aluno não existe', async () => {
    const admin = await criarUsuario({ role: 'admin' });
    const res = await request(app)
      .get('/api/admin/alunos/999999999')
      .set('Authorization', `Bearer ${gerarToken(admin)}`);
    expect(res.status).toBe(404);
    await pool.query('DELETE FROM usuarios WHERE id = $1', [admin.id]);
  });

  test('rejeita aluno comum', async () => {
    const aluno = await criarUsuario({ role: 'aluno' });
    const res = await request(app)
      .get(`/api/admin/alunos/${aluno.id}`)
      .set('Authorization', `Bearer ${gerarToken(aluno)}`);
    expect(res.status).toBe(403);
    await pool.query('DELETE FROM usuarios WHERE id = $1', [aluno.id]);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falham**

Run: `cd backend && NODE_ENV=test npx jest routes/admin.test.js -t "detalhe"`
Expected: FAIL — rota inexistente, 404 pro primeiro teste (esperava 200).

- [ ] **Step 3: Implementar a rota**

Em `backend/src/routes/admin.js`, adicionar logo depois da rota `GET /alunos` (depois da linha 176, antes de `// PATCH /api/admin/alunos/:id/toggle`):

```javascript
// GET /api/admin/alunos/:id — detalhe completo de 1 aluno (painel "Mais opções")
router.get('/alunos/:id', authMiddleware, requireRole('admin', 'dono'), async (req, res, next) => {
  try {
    const { rows: [aluno] } = await pool.query(
      `SELECT u.id, u.nome, u.email, u.telefone, u.cpf, u.apelido, u.foto_url, u.ativo, u.controlid_user_id,
              m.id as matricula_id, m.status as matricula_status, m.data_vencimento, p.nome as plano_nome
       FROM usuarios u
       LEFT JOIN matriculas m ON m.usuario_id = u.id AND m.status = 'ativa'
       LEFT JOIN planos p ON p.id = m.plano_id
       WHERE u.id = $1 AND u.role = 'aluno'`,
      [req.params.id]
    );
    if (!aluno) return res.status(404).json({ error: 'Aluno não encontrado' });

    const { rows: [{ ultima_mensalidade }] } = await pool.query(
      `SELECT MAX(data_pagamento) AS ultima_mensalidade FROM pagamentos WHERE usuario_id = $1 AND status = 'pago'`,
      [req.params.id]
    );

    res.json({ ...aluno, ultima_mensalidade });
  } catch (err) {
    next(err);
  }
});
```

- [ ] **Step 4: Rodar de novo e confirmar que passam**

Run: `cd backend && NODE_ENV=test npx jest routes/admin.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/admin.js backend/src/routes/admin.test.js
git commit -m "$(cat <<'EOF'
feat(admin): endpoint GET /api/admin/alunos/:id com detalhe completo

Retorna dados pessoais, plano ativo, vencimento e ultima mensalidade
paga - alimenta o painel "Mais opcoes" do frontend.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: `GET /api/admin/alunos/:id/frequencia` — últimos 30 dias

**Files:**
- Modify: `backend/src/routes/admin.js` (nova rota, logo depois da Task 3)
- Modify: `backend/src/routes/admin.test.js`

**Interfaces:**
- Produces: `GET /api/admin/alunos/:id/frequencia` → `[{ data: 'YYYY-MM-DD', foi: boolean }, ...]`, 30 itens, mais antigo primeiro. Consumido pela Task 10 (frontend).

- [ ] **Step 1: Escrever o teste que falha**

Adicionar ao final de `backend/src/routes/admin.test.js`:

```javascript
describe('GET /api/admin/alunos/:id/frequencia', () => {
  test('retorna 30 dias, marcando os dias com check-in como foi: true', async () => {
    const admin = await criarUsuario({ role: 'admin' });
    const aluno = await criarUsuario({ role: 'aluno' });
    const hoje = new Date().toISOString().slice(0, 10);
    const ontem = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    await pool.query(`INSERT INTO frequencias (usuario_id, data) VALUES ($1, $2), ($1, $3)`, [aluno.id, hoje, ontem]);

    const res = await request(app)
      .get(`/api/admin/alunos/${aluno.id}/frequencia`)
      .set('Authorization', `Bearer ${gerarToken(admin)}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(30);
    expect(res.body[res.body.length - 1].data.slice(0, 10)).toBe(hoje);
    expect(res.body[res.body.length - 1].foi).toBe(true);
    expect(res.body[res.body.length - 2].foi).toBe(true);
    expect(res.body[0].foi).toBe(false);

    await pool.query('DELETE FROM frequencias WHERE usuario_id = $1', [aluno.id]);
    await pool.query('DELETE FROM usuarios WHERE id = ANY($1)', [[admin.id, aluno.id]]);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd backend && NODE_ENV=test npx jest routes/admin.test.js -t "frequencia"`
Expected: FAIL — 404 (rota não existe).

- [ ] **Step 3: Implementar a rota**

Em `backend/src/routes/admin.js`, logo depois da rota `GET /alunos/:id` da Task 3:

```javascript
// GET /api/admin/alunos/:id/frequencia — últimos 30 dias (foi/não foi), pro gráfico do painel
router.get('/alunos/:id/frequencia', authMiddleware, requireRole('admin', 'dono'), async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT gs.dia::date AS data, (f.id IS NOT NULL) AS foi
       FROM generate_series(CURRENT_DATE - INTERVAL '29 days', CURRENT_DATE, INTERVAL '1 day') AS gs(dia)
       LEFT JOIN frequencias f ON f.usuario_id = $1 AND f.data = gs.dia::date
       ORDER BY gs.dia`,
      [req.params.id]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});
```

- [ ] **Step 4: Rodar de novo e confirmar que passa**

Run: `cd backend && NODE_ENV=test npx jest routes/admin.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/admin.js backend/src/routes/admin.test.js
git commit -m "$(cat <<'EOF'
feat(admin): endpoint GET /api/admin/alunos/:id/frequencia (30 dias)

Serie fixa de 30 dias via generate_series + LEFT JOIN frequencias,
marcando foi:true/false por dia - alimenta o grafico de frequencia do
painel "Mais opcoes".

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: `DELETE /api/admin/alunos/:id` (soft-delete) + listagem filtra excluídos

**Files:**
- Modify: `backend/src/routes/admin.js` (listagem `GET /alunos` em `admin.js:146-176`, nova rota `DELETE`)
- Modify: `backend/src/routes/admin.test.js`

**Interfaces:**
- Consumes: `catracaService.bloquearAcesso` (já existe).
- Produces: `DELETE /api/admin/alunos/:id` → `{ ok: true }`. `GET /api/admin/alunos` some com quem tem `excluido_em` preenchido.

- [ ] **Step 1: Escrever os testes que falham**

Adicionar ao final de `backend/src/routes/admin.test.js`:

```javascript
describe('DELETE /api/admin/alunos/:id — exclusão (soft-delete)', () => {
  beforeEach(() => {
    catracaService.bloquearAcesso.mockReset();
  });

  test('marca excluido_em, desativa e some da listagem, sem apagar matricula/pagamento', async () => {
    catracaService.bloquearAcesso.mockResolvedValue(undefined);
    const admin = await criarUsuario({ role: 'admin' });
    const aluno = await criarUsuario({ nome: 'Aluno Pra Excluir', role: 'aluno' });
    const plano = await criarPlano({ nome: 'Plano Exclusao Teste' });
    const matricula = await criarMatricula({ usuario_id: aluno.id, plano_id: plano.id, status: 'ativa' });

    const res = await request(app)
      .delete(`/api/admin/alunos/${aluno.id}`)
      .set('Authorization', `Bearer ${gerarToken(admin)}`);

    expect(res.status).toBe(200);
    expect(catracaService.bloquearAcesso).toHaveBeenCalledWith(aluno.id);

    const { rows: [row] } = await pool.query('SELECT ativo, excluido_em FROM usuarios WHERE id = $1', [aluno.id]);
    expect(row.ativo).toBe(false);
    expect(row.excluido_em).not.toBeNull();

    const { rows: [matriculaAinda] } = await pool.query('SELECT id FROM matriculas WHERE id = $1', [matricula.id]);
    expect(matriculaAinda).toBeDefined();

    const listagem = await request(app)
      .get('/api/admin/alunos?limit=100')
      .set('Authorization', `Bearer ${gerarToken(admin)}`);
    expect(listagem.body.alunos.some((a) => a.id === aluno.id)).toBe(false);

    await pool.query('DELETE FROM matriculas WHERE id = $1', [matricula.id]);
    await pool.query('DELETE FROM planos WHERE id = $1', [plano.id]);
    await pool.query('DELETE FROM usuarios WHERE id = ANY($1)', [[admin.id, aluno.id]]);
  });

  test('404 quando o aluno não existe', async () => {
    const admin = await criarUsuario({ role: 'admin' });
    const res = await request(app)
      .delete('/api/admin/alunos/999999999')
      .set('Authorization', `Bearer ${gerarToken(admin)}`);
    expect(res.status).toBe(404);
    await pool.query('DELETE FROM usuarios WHERE id = $1', [admin.id]);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falham**

Run: `cd backend && NODE_ENV=test npx jest routes/admin.test.js -t "exclusão"`
Expected: FAIL — rota `DELETE` inexistente (404 inesperado no primeiro teste).

- [ ] **Step 3: Implementar**

Em `backend/src/routes/admin.js`, mudar o `where` base da listagem (linha 154) de:

```javascript
    let where = "WHERE u.role = 'aluno'";
```

para:

```javascript
    let where = "WHERE u.role = 'aluno' AND u.excluido_em IS NULL";
```

E adicionar a rota nova, logo depois da rota `GET /alunos/:id/frequencia` da Task 4:

```javascript
// DELETE /api/admin/alunos/:id — exclusão lógica (soma da lista, bloqueia acesso, preserva histórico)
router.delete('/alunos/:id', authMiddleware, requireRole('admin', 'dono'), async (req, res, next) => {
  try {
    const { rows: [user] } = await pool.query(
      `UPDATE usuarios SET excluido_em = NOW(), ativo = FALSE, updated_at = NOW()
       WHERE id = $1 AND role = 'aluno' RETURNING id`,
      [req.params.id]
    );
    if (!user) return res.status(404).json({ error: 'Aluno não encontrado' });

    try {
      await catracaService.bloquearAcesso(user.id);
    } catch (err) {
      logger.error('catraca.bloquearAcesso falhou (exclusão)', { usuarioId: user.id, erro: err.message });
    }

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
```

- [ ] **Step 4: Rodar de novo e confirmar que passam**

Run: `cd backend && NODE_ENV=test npx jest routes/admin.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/admin.js backend/src/routes/admin.test.js
git commit -m "$(cat <<'EOF'
feat(admin): exclusao (soft-delete) de aluno via DELETE /api/admin/alunos/:id

Marca excluido_em + ativo=false, bloqueia na catraca, e a listagem
passa a filtrar excluido_em IS NULL. Historico financeiro (matriculas/
pagamentos) preservado - constraints ON DELETE RESTRICT (migration 016)
continuam intocadas.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Apelido no perfil do aluno (self-service)

**Files:**
- Modify: `backend/src/routes/alunos.js:51-92`
- Modify: `backend/src/routes/alunos.test.js`

**Interfaces:**
- Produces: `GET /api/alunos/perfil` passa a incluir `apelido`; `PATCH /api/alunos/perfil` aceita `apelido` no body.

- [ ] **Step 1: Escrever os testes que falham**

Verificar o describe existente em `backend/src/routes/alunos.test.js` pra saber onde encaixar (mesmo padrão `criarUsuario` + `gerarToken` já usado nos outros arquivos). Adicionar:

```javascript
describe('apelido no perfil', () => {
  test('GET /api/alunos/perfil inclui apelido', async () => {
    const aluno = await criarUsuario({ role: 'aluno' });
    await pool.query('UPDATE usuarios SET apelido = $1 WHERE id = $2', ['Alunão', aluno.id]);

    const res = await request(app)
      .get('/api/alunos/perfil')
      .set('Authorization', `Bearer ${gerarToken(aluno)}`);

    expect(res.status).toBe(200);
    expect(res.body.apelido).toBe('Alunão');

    await pool.query('DELETE FROM usuarios WHERE id = $1', [aluno.id]);
  });

  test('PATCH /api/alunos/perfil salva apelido', async () => {
    const aluno = await criarUsuario({ role: 'aluno' });

    const res = await request(app)
      .patch('/api/alunos/perfil')
      .set('Authorization', `Bearer ${gerarToken(aluno)}`)
      .send({ apelido: 'Turbo' });

    expect(res.status).toBe(200);
    expect(res.body.apelido).toBe('Turbo');

    const { rows: [row] } = await pool.query('SELECT apelido FROM usuarios WHERE id = $1', [aluno.id]);
    expect(row.apelido).toBe('Turbo');

    await pool.query('DELETE FROM usuarios WHERE id = $1', [aluno.id]);
  });
});
```

(`backend/src/routes/alunos.test.js:1-4` já importa `request`, `app`, `pool`, `criarUsuario`, `criarPlano`, `criarMatricula`, `gerarToken` — nenhum import novo é necessário pra esses testes.)

- [ ] **Step 2: Rodar e confirmar que falham**

Run: `cd backend && NODE_ENV=test npx jest routes/alunos.test.js -t "apelido"`
Expected: FAIL — `res.body.apelido` é `undefined` no GET; PATCH retorna 400 "Nenhum campo válido enviado" (campo não está em `CAMPOS_PERMITIDOS`).

- [ ] **Step 3: Implementar**

Em `backend/src/routes/alunos.js`, linha 54, adicionar `u.apelido` no SELECT do `GET /perfil`:

```javascript
      `SELECT u.id, u.nome, u.email, u.telefone, u.cpf, u.apelido, u.data_nascimento, u.foto_url, u.notificacoes_whatsapp,
              m.status as matricula_status, m.data_vencimento, p.nome as plano_nome
```

Linha 73, adicionar `'apelido'` em `CAMPOS_PERMITIDOS`:

```javascript
    const CAMPOS_PERMITIDOS = ['nome', 'telefone', 'foto_url', 'data_nascimento', 'notificacoes_whatsapp', 'apelido'];
```

Linha 85, adicionar `apelido` no `RETURNING`:

```javascript
      `UPDATE usuarios SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${values.length} RETURNING id, nome, email, telefone, foto_url, apelido, notificacoes_whatsapp`,
```

- [ ] **Step 4: Rodar de novo e confirmar que passam**

Run: `cd backend && NODE_ENV=test npx jest routes/alunos.test.js`
Expected: PASS (arquivo inteiro).

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/alunos.js backend/src/routes/alunos.test.js
git commit -m "$(cat <<'EOF'
feat(alunos): apelido editavel no perfil do aluno

GET/PATCH /api/alunos/perfil passam a ler/gravar apelido, exibido no
painel "Mais opcoes" do admin.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Upload de foto de perfil (Supabase Storage)

**Files:**
- Modify: `backend/package.json` (novas dependências)
- Modify: `backend/.env.example`
- Create: `backend/src/services/supabaseStorageService.js`
- Create: `backend/src/services/supabaseStorageService.test.js`
- Modify: `backend/src/routes/alunos.js` (nova rota)
- Modify: `backend/src/routes/alunos.test.js`

**Interfaces:**
- Produces: `supabaseStorageService.uploadFotoPerfil(usuarioId, buffer, mimeType): Promise<string>` (URL pública). `POST /api/alunos/perfil/foto` (multipart, campo `foto`) → `{ foto_url }`, e grava em `usuarios.foto_url`.

- [ ] **Step 1: Instalar as dependências novas**

Run: `cd backend && npm install multer @supabase/supabase-js`
Expected: `backend/package.json` ganha `"multer"` e `"@supabase/supabase-js"` em `dependencies`.

- [ ] **Step 2: Documentar as env vars novas**

Em `backend/.env.example`, adicionar ao final:

```
SUPABASE_URL=https://SEU_PROJECT_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=sua_service_role_key_do_projeto_supabase
```

- [ ] **Step 3: Escrever o teste que falha (serviço)**

Criar `backend/src/services/supabaseStorageService.test.js`:

```javascript
jest.mock('@supabase/supabase-js');
const { createClient } = require('@supabase/supabase-js');

describe('uploadFotoPerfil', () => {
  beforeEach(() => {
    jest.resetModules();
    process.env.SUPABASE_URL = 'https://exemplo.supabase.co';
    process.env.SUPABASE_SERVICE_ROLE_KEY = 'chave-teste';
  });

  test('sobe o arquivo e retorna a URL pública', async () => {
    const upload = jest.fn().mockResolvedValue({ error: null });
    const getPublicUrl = jest.fn().mockReturnValue({ data: { publicUrl: 'https://exemplo.supabase.co/storage/v1/object/public/fotos-perfil/42-123.jpg' } });
    createClient.mockReturnValue({
      storage: { from: jest.fn().mockReturnValue({ upload, getPublicUrl }) },
    });

    const supabaseStorageService = require('./supabaseStorageService');
    const url = await supabaseStorageService.uploadFotoPerfil(42, Buffer.from('fake'), 'image/jpeg');

    expect(url).toBe('https://exemplo.supabase.co/storage/v1/object/public/fotos-perfil/42-123.jpg');
    expect(upload).toHaveBeenCalledWith(
      expect.stringMatching(/^42-\d+\.jpeg$/),
      expect.any(Buffer),
      expect.objectContaining({ contentType: 'image/jpeg', upsert: true })
    );
  });

  test('propaga erro quando o Supabase Storage falha', async () => {
    const upload = jest.fn().mockResolvedValue({ error: { message: 'bucket não encontrado' } });
    createClient.mockReturnValue({
      storage: { from: jest.fn().mockReturnValue({ upload, getPublicUrl: jest.fn() }) },
    });

    const supabaseStorageService = require('./supabaseStorageService');
    await expect(supabaseStorageService.uploadFotoPerfil(42, Buffer.from('fake'), 'image/jpeg'))
      .rejects.toThrow('bucket não encontrado');
  });
});
```

- [ ] **Step 4: Rodar e confirmar que falha**

Run: `cd backend && NODE_ENV=test npx jest services/supabaseStorageService.test.js`
Expected: FAIL — `Cannot find module './supabaseStorageService'`.

- [ ] **Step 5: Implementar o serviço**

Criar `backend/src/services/supabaseStorageService.js`:

```javascript
const { createClient } = require('@supabase/supabase-js');

const BUCKET = 'fotos-perfil';
let client = null;

function getClient() {
  if (!client) {
    client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  }
  return client;
}

async function uploadFotoPerfil(usuarioId, buffer, mimeType) {
  const ext = mimeType.split('/')[1];
  const caminho = `${usuarioId}-${Date.now()}.${ext}`;

  const { error } = await getClient().storage.from(BUCKET).upload(caminho, buffer, {
    contentType: mimeType,
    upsert: true,
  });
  if (error) throw new Error(error.message);

  const { data } = getClient().storage.from(BUCKET).getPublicUrl(caminho);
  return data.publicUrl;
}

module.exports = { uploadFotoPerfil };
```

- [ ] **Step 6: Rodar de novo e confirmar que passa**

Run: `cd backend && NODE_ENV=test npx jest services/supabaseStorageService.test.js`
Expected: PASS.

- [ ] **Step 7: Escrever o teste do endpoint (falha)**

Adicionar ao final de `backend/src/routes/alunos.test.js`:

```javascript
jest.mock('../services/supabaseStorageService');
const supabaseStorageService = require('../services/supabaseStorageService');

describe('POST /api/alunos/perfil/foto', () => {
  test('sobe a foto e grava foto_url no usuário', async () => {
    supabaseStorageService.uploadFotoPerfil.mockResolvedValue('https://exemplo.supabase.co/foto-nova.jpg');
    const aluno = await criarUsuario({ role: 'aluno' });

    const res = await request(app)
      .post('/api/alunos/perfil/foto')
      .set('Authorization', `Bearer ${gerarToken(aluno)}`)
      .attach('foto', Buffer.from('fake-image-bytes'), { filename: 'foto.jpg', contentType: 'image/jpeg' });

    expect(res.status).toBe(200);
    expect(res.body.foto_url).toBe('https://exemplo.supabase.co/foto-nova.jpg');
    expect(supabaseStorageService.uploadFotoPerfil).toHaveBeenCalledWith(aluno.id, expect.any(Buffer), 'image/jpeg');

    const { rows: [row] } = await pool.query('SELECT foto_url FROM usuarios WHERE id = $1', [aluno.id]);
    expect(row.foto_url).toBe('https://exemplo.supabase.co/foto-nova.jpg');

    await pool.query('DELETE FROM usuarios WHERE id = $1', [aluno.id]);
  });

  test('rejeita sem arquivo', async () => {
    const aluno = await criarUsuario({ role: 'aluno' });
    const res = await request(app)
      .post('/api/alunos/perfil/foto')
      .set('Authorization', `Bearer ${gerarToken(aluno)}`);
    expect(res.status).toBe(400);
    await pool.query('DELETE FROM usuarios WHERE id = $1', [aluno.id]);
  });

  test('rejeita tipo de arquivo não suportado', async () => {
    const aluno = await criarUsuario({ role: 'aluno' });
    const res = await request(app)
      .post('/api/alunos/perfil/foto')
      .set('Authorization', `Bearer ${gerarToken(aluno)}`)
      .attach('foto', Buffer.from('fake-pdf-bytes'), { filename: 'doc.pdf', contentType: 'application/pdf' });
    expect(res.status).toBe(400);
    await pool.query('DELETE FROM usuarios WHERE id = $1', [aluno.id]);
  });
});
```

- [ ] **Step 8: Rodar e confirmar que falha**

Run: `cd backend && NODE_ENV=test npx jest routes/alunos.test.js -t "perfil/foto"`
Expected: FAIL — rota inexistente (404).

- [ ] **Step 9: Implementar a rota**

Em `backend/src/routes/alunos.js`, adicionar os imports no topo (depois da linha 3):

```javascript
const multer = require('multer');
const supabaseStorageService = require('../services/supabaseStorageService');
```

Adicionar, logo depois da configuração do router (depois da linha 5, antes da rota `GET /dashboard`):

```javascript
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      return cb(new Error('Formato de imagem não suportado (use JPEG, PNG ou WEBP)'));
    }
    cb(null, true);
  },
});
```

E adicionar a rota nova, logo depois da rota `PATCH /perfil` (depois da linha 92, antes de `module.exports`):

```javascript
// POST /api/alunos/perfil/foto — upload da foto de perfil (Supabase Storage)
router.post('/perfil/foto', authMiddleware, (req, res, next) => {
  upload.single('foto')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });

    try {
      const foto_url = await supabaseStorageService.uploadFotoPerfil(req.user.id, req.file.buffer, req.file.mimetype);
      await pool.query('UPDATE usuarios SET foto_url = $1, updated_at = NOW() WHERE id = $2', [foto_url, req.user.id]);
      res.json({ foto_url });
    } catch (uploadErr) {
      next(uploadErr);
    }
  });
});
```

- [ ] **Step 10: Rodar de novo e confirmar que passam**

Run: `cd backend && NODE_ENV=test npx jest routes/alunos.test.js`
Expected: PASS (arquivo inteiro).

- [ ] **Step 11: Rodar a suíte inteira do backend**

Run: `cd backend && NODE_ENV=test npx jest --runInBand --forceExit`
Expected: PASS (todas as suítes, incluindo as das Tasks 1-6).

- [ ] **Step 12: Commit**

```bash
git add backend/package.json backend/package-lock.json backend/.env.example backend/src/services/supabaseStorageService.js backend/src/services/supabaseStorageService.test.js backend/src/routes/alunos.js backend/src/routes/alunos.test.js
git commit -m "$(cat <<'EOF'
feat(alunos): upload de foto de perfil via Supabase Storage

Novo endpoint POST /api/alunos/perfil/foto (multer + Supabase Storage,
bucket fotos-perfil). Aluno sobe a propria foto no perfil dele; o admin
so le foto_url, sem UI de edicao no painel.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Frontend — botão único + fileira reorganizada + ícone novo

**Files:**
- Modify: `frontend/assets/js/icons.js`
- Modify: `frontend/admin/alunos.html`
- Modify: `frontend/assets/js/admin-alunos.js`
- Modify: `frontend/assets/css/admin.css`

**Interfaces:**
- Produces: `Icons.icon('more-vertical', {size})` disponível pro resto do app. Nenhuma outra interface nova — só reorganização visual.

- [ ] **Step 1: Adicionar o ícone `more-vertical`**

Em `frontend/assets/js/icons.js`, adicionar uma entrada nova ao mapa `ICONS`, logo depois de `bell:` (linha 80, antes do `};` de fechamento):

```javascript
  'more-vertical': '<path d="M11 18C11 18.5523 11.4477 19 12 19C12.5523 19 13 18.5523 13 18C13 17.4477 12.5523 17 12 17C11.4477 17 11 17.4477 11 18Z"/><path d="M11 12C11 12.5523 11.4477 13 12 13C12.5523 13 13 12.5523 13 12C13 11.4477 12.5523 11 12 11C11.4477 11 11 11.4477 11 12Z"/><path d="M11 6C11 6.55228 11.4477 7 12 7C12.5523 7 13 6.55228 13 6C13 5.44772 12.5523 5 12 5C11.4477 5 11 5.44772 11 6Z"/>',
```

- [ ] **Step 2: Validar sintaxe**

Run: `node --check frontend/assets/js/icons.js`
Expected: nenhum output.

- [ ] **Step 3: Remover "Novo Cliente" de `alunos.html`**

Em `frontend/admin/alunos.html`, remover o bloco `<div class="filters-row">` inteiro (linhas 39-47) e substituir por uma versão só com a busca:

```html
      <div class="filters-row">
        <div class="search-field">
          <span data-icon="search" data-icon-size="16"></span>
          <input type="text" id="busca-aluno" placeholder="Buscar por nome ou e-mail..." />
        </div>
      </div>
```

Remover também o `<dialog id="dialog-novo-cliente">` inteiro (linhas 63-90 no arquivo atual).

Mudar a largura da última coluna da tabela (linha 52) de `width:150px` pra `width:190px` (agora a célula tem chavinha+rótulo+botão):

```html
            <tr><th>Aluno</th><th>Plano</th><th>Vencimento</th><th>XP</th><th>Sequência</th><th>Acesso à academia</th><th style="width:190px"></th></tr>
```

- [ ] **Step 4: Adicionar `dialog-detalhe-aluno` (esqueleto — conteúdo completo na Task 9)**

Em `frontend/admin/alunos.html`, logo depois do `</dialog>` que fecha `dialog-adicionar-aluno` e antes dos `<script>` finais, adicionar só o esqueleto agora (a Task 9 preenche o `<form>` por dentro):

```html
  <dialog id="dialog-detalhe-aluno" class="admin-dialog admin-dialog-lg"></dialog>

  <dialog id="dialog-confirmar-exclusao" class="admin-dialog">
    <form id="form-confirmar-exclusao" method="dialog">
      <h2>Excluir aluno</h2>
      <p class="text-muted" id="confirmar-exclusao-texto"></p>
      <div class="dialog-actions">
        <button type="button" class="btn btn-ghost" id="btn-confirmar-exclusao-cancelar">Cancelar</button>
        <button type="submit" class="btn btn-danger" id="btn-confirmar-exclusao-ok">Excluir</button>
      </div>
    </form>
  </dialog>
```

- [ ] **Step 5: Remover o código de "Novo Cliente" de `admin-alunos.js`**

Remover o bloco inteiro de `// Dialog matricula` até o fim do handler `formNovoCliente.addEventListener('submit', ...)` que referencia `dialog-novo-cliente` — especificamente as linhas 254-300 (do `const dialogNovoCliente = ...` até o `});` que fecha o submit de `formNovoCliente`). **Não remover** o bloco `// Dialog matricula` (linhas 171-228 atuais) nem `gerarSenhaTemp`/`caractereAleatorio` (linhas 236-252) — esses continuam em uso pela Task 9 e pelo assistente "Adicionar aluno".

- [ ] **Step 6: Reorganizar a fileira (célula de ações) e remover os 3 handlers antigos de ícone solto**

Em `frontend/assets/js/admin-alunos.js`, o bloco da célula de ações dentro de `carregarAlunos` (linhas 74-92 atuais):

```javascript
            <td style="display:flex;gap:.4rem;align-items:center">
              <label class="switch" title="Liberar/Bloquear acesso à academia (catraca)">
                <input type="checkbox" data-toggle-id="${a.id}" ${a.ativo ? 'checked' : ''} />
                <span class="slider"></span>
              </label>
              <button class="btn btn-ghost btn-sm" data-mat-id="${a.id}" data-mat-nome="${escapeHtml(a.nome)}"
                data-mat-matricula-id="${a.matricula_id || ''}"
                title="${a.matricula_status === 'ativa' ? 'Renovar matrícula' : 'Matricular'}">
                ${a.matricula_status === 'ativa' ? Icons.icon('refresh-cw', { size: 14 }) : Icons.icon('user-plus', { size: 14 })}
              </button>
              <button class="btn btn-ghost btn-sm" data-reset-id="${a.id}" data-reset-nome="${escapeHtml(a.nome)}" title="Redefinir senha">
                ${Icons.icon('key', { size: 14 })}
              </button>
              <button class="btn btn-ghost btn-sm" data-catraca-id="${a.id}" data-catraca-nome="${escapeHtml(a.nome)}" data-catraca-valor="${escapeHtml(a.controlid_user_id || '')}"
                title="${a.controlid_user_id ? `Vinculado à catraca (ID ${escapeHtml(a.controlid_user_id)})` : 'Vincular à catraca (reconhecimento facial)'}"
                style="${a.controlid_user_id ? 'color:var(--color-success)' : ''}">
                ${Icons.icon('shield-check', { size: 14 })}
              </button>
            </td>
```

vira:

```javascript
            <td class="acoes-aluno">
              <div class="switch-row">
                <label class="switch" title="Liberar/Bloquear acesso à academia (catraca)">
                  <input type="checkbox" data-toggle-id="${a.id}" ${a.ativo ? 'checked' : ''} />
                  <span class="slider"></span>
                </label>
                <span class="switch-label">Acesso</span>
              </div>
              <button class="btn btn-ghost btn-sm" data-detalhe-id="${a.id}" title="Mais opções">
                ${Icons.icon('more-vertical', { size: 16 })}
              </button>
            </td>
```

Substituir o bloco de click-delegation em `#alunos-body` (linhas 118-169 atuais, `document.getElementById('alunos-body').addEventListener('click', async (ev) => { ... })` inteiro, que hoje trata `data-reset-id`/`data-mat-id`/`data-catraca-id`) por uma versão só com `data-detalhe-id`, que abre o novo painel (a função `abrirDialogDetalhe` é implementada na Task 9 — aqui só o gancho):

```javascript
// Abre o painel "Mais opções"
document.getElementById('alunos-body').addEventListener('click', async (ev) => {
  const btnDetalhe = ev.target.closest('[data-detalhe-id]');
  if (btnDetalhe) {
    await abrirDialogDetalhe(btnDetalhe.dataset.detalheId);
  }
});
```

O listener de `change` do toggle (linhas 101-116 atuais) **não muda** — continua exatamente como está.

- [ ] **Step 7: CSS da fileira reorganizada**

Em `frontend/assets/css/admin.css`, adicionar depois do bloco `.wizard-step.active .wizard-step-num { ... }` (inserido na sessão anterior) e antes do comentário `/* ===== Gráfico simples de barras ... ===== */`:

```css
/* ===== Fileira de aluno: chavinha + rótulo + "mais opções" ===== */
.acoes-aluno { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; }
.switch-row { display: flex; align-items: center; gap: 0.4rem; }
.switch-label { font-size: 0.72rem; color: var(--color-muted); white-space: nowrap; }
```

- [ ] **Step 8: Validar sintaxe do JS**

Run: `node --check frontend/assets/js/admin-alunos.js`
Expected: nenhum output.

- [ ] **Step 9: Commit**

```bash
git add frontend/assets/js/icons.js frontend/admin/alunos.html frontend/assets/js/admin-alunos.js frontend/assets/css/admin.css
git commit -m "$(cat <<'EOF'
style(alunos): remove botao duplicado, reorganiza fileira com chavinha+rotulo+mais-opcoes

Remove "Novo Cliente" (so sobra "Adicionar aluno", que ja cobre o
mesmo fluxo + facial). Os 3 icones soltos da fileira (matricular,
senha, catraca) saem da linha e migram pro painel "Mais opcoes"
(implementado na proxima task) - a linha fica so com a chavinha
rotulada e um botao unico.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Frontend — painel "Mais opções" (dados + atalhos + exclusão)

**Files:**
- Modify: `frontend/admin/alunos.html` (preenche `dialog-detalhe-aluno`)
- Modify: `frontend/assets/js/admin-alunos.js` (implementa `abrirDialogDetalhe` + atalhos + exclusão)
- Modify: `frontend/assets/css/admin.css`

**Interfaces:**
- Consumes: `GET /api/admin/alunos/:id` (Task 3), `DELETE /api/admin/alunos/:id` (Task 5), `abrirDialogMatricula` (já existe em `admin-alunos.js`), `Icons.icon('more-vertical', ...)` (Task 8).
- Produces: `abrirDialogDetalhe(usuarioId)` global, chamada pela Task 8. A Task 10 injeta o gráfico de frequência dentro do mesmo diálogo (usa o elemento `#detalhe-frequencia` criado aqui).

- [ ] **Step 1: Preencher o conteúdo de `dialog-detalhe-aluno`**

Em `frontend/admin/alunos.html`, substituir o esqueleto criado na Task 8:

```html
  <dialog id="dialog-detalhe-aluno" class="admin-dialog admin-dialog-lg"></dialog>
```

por (o `<form>` fica vazio no HTML — o conteúdo é sempre montado via `innerHTML` no JS, porque depende dos dados carregados; ver Step 2):

```html
  <dialog id="dialog-detalhe-aluno" class="admin-dialog admin-dialog-lg">
    <div id="detalhe-conteudo"></div>
  </dialog>
```

- [ ] **Step 2: Implementar `abrirDialogDetalhe` e os atalhos em `admin-alunos.js`**

Adicionar ao final de `frontend/assets/js/admin-alunos.js`:

```javascript
// ===== Painel "Mais opções" (detalhe do aluno) =====
const dialogDetalhe = document.getElementById('dialog-detalhe-aluno');
const detalheConteudo = document.getElementById('detalhe-conteudo');
let detalheAlunoAtual = null;

function renderDetalheAluno(aluno) {
  detalheConteudo.innerHTML = `
    <div class="detalhe-head">
      <span class="avatar-fallback" style="width:56px;height:56px;font-size:1.1rem">${escapeHtml(iniciais(aluno.nome))}</span>
      <div>
        <strong>${escapeHtml(aluno.nome)}</strong>
        ${aluno.apelido ? `<div class="text-muted" style="font-size:.85rem">"${escapeHtml(aluno.apelido)}"</div>` : ''}
      </div>
    </div>

    <div class="detalhe-grid">
      <div><span class="text-muted">CPF</span><div>${escapeHtml(aluno.cpf || 'Não informado')}</div></div>
      <div><span class="text-muted">E-mail</span><div>${escapeHtml(aluno.email)}</div></div>
      <div><span class="text-muted">Telefone</span><div>${escapeHtml(aluno.telefone || 'Não informado')}</div></div>
      <div><span class="text-muted">Plano</span><div>${aluno.plano_nome ? escapeHtml(aluno.plano_nome) : 'Sem plano ativo'}</div></div>
      <div><span class="text-muted">Vencimento</span><div>${formatData(aluno.data_vencimento)}</div></div>
      <div><span class="text-muted">Última mensalidade</span><div>${formatData(aluno.ultima_mensalidade)}</div></div>
    </div>

    <div class="detalhe-atalhos">
      <button type="button" class="btn btn-ghost btn-sm" id="btn-detalhe-matricular">
        ${Icons.icon(aluno.matricula_status === 'ativa' ? 'refresh-cw' : 'user-plus', { size: 14 })}
        ${aluno.matricula_status === 'ativa' ? 'Renovar matrícula' : 'Matricular'}
      </button>
      <button type="button" class="btn btn-ghost btn-sm" id="btn-detalhe-senha">
        ${Icons.icon('key', { size: 14 })}Redefinir senha
      </button>
      <button type="button" class="btn btn-ghost btn-sm" id="btn-detalhe-catraca" style="${aluno.controlid_user_id ? 'color:var(--color-success)' : ''}">
        ${Icons.icon('shield-check', { size: 14 })}
        ${aluno.controlid_user_id ? `Vinculado (ID ${escapeHtml(aluno.controlid_user_id)})` : 'Vincular à catraca'}
      </button>
    </div>

    <div class="detalhe-frequencia">
      <h3>Frequência (últimos 30 dias)</h3>
      <div id="detalhe-frequencia-grid" class="freq30-grid"></div>
      <div class="freq30-legenda">
        <span class="freq30-legenda-item"><span class="freq30-legenda-dot foi"></span>Foi</span>
        <span class="freq30-legenda-item"><span class="freq30-legenda-dot"></span>Faltou</span>
      </div>
    </div>

    <div class="dialog-actions">
      <button type="button" class="btn btn-danger btn-sm" id="btn-detalhe-excluir">
        ${Icons.icon('trash-2', { size: 14 })}Excluir aluno
      </button>
      <button type="button" class="btn btn-ghost" id="btn-detalhe-fechar">Fechar</button>
    </div>
  `;

  document.getElementById('btn-detalhe-fechar').addEventListener('click', () => dialogDetalhe.close());

  document.getElementById('btn-detalhe-matricular').addEventListener('click', async () => {
    dialogDetalhe.close();
    await abrirDialogMatricula(aluno.id, aluno.nome, aluno.matricula_id || '');
  });

  document.getElementById('btn-detalhe-senha').addEventListener('click', async () => {
    const nova_senha = prompt(`Nova senha para ${aluno.nome} (mínimo 6 caracteres):`);
    if (!nova_senha) return;
    if (nova_senha.length < 6) { toast('Senha deve ter no mínimo 6 caracteres.', 'error'); return; }
    try {
      await api.patch(`/api/admin/alunos/${aluno.id}/senha`, { nova_senha });
      toast(`Senha de ${aluno.nome} redefinida com sucesso.`, 'success');
    } catch (err) {
      toast(err.message || 'Erro ao redefinir senha.', 'error');
    }
  });

  document.getElementById('btn-detalhe-catraca').addEventListener('click', async () => {
    const novoValor = prompt(
      `ID do aluno no Control iD (catraca) para ${aluno.nome}:\nDeixe em branco para desvincular.`,
      aluno.controlid_user_id || ''
    );
    if (novoValor === null) return;
    try {
      await api.patch(`/api/admin/alunos/${aluno.id}/catraca`, { controlid_user_id: novoValor.trim() || null });
      toast(novoValor.trim() ? `${aluno.nome} vinculado à catraca.` : `${aluno.nome} desvinculado da catraca.`, 'success');
      dialogDetalhe.close();
      carregarAlunos(document.getElementById('busca-aluno').value.trim(), paginaAtual);
    } catch (err) {
      toast(err.message || 'Erro ao vincular catraca.', 'error');
    }
  });

  document.getElementById('btn-detalhe-excluir').addEventListener('click', () => {
    dialogDetalhe.close();
    abrirConfirmarExclusao(aluno);
  });

  renderFrequencia30Dias(aluno.id);
}

async function abrirDialogDetalhe(usuarioId) {
  try {
    detalheAlunoAtual = await api.get(`/api/admin/alunos/${usuarioId}`);
    renderDetalheAluno(detalheAlunoAtual);
    dialogDetalhe.showModal();
  } catch (err) {
    toast(err.message || 'Erro ao carregar dados do aluno.', 'error');
  }
}

// ===== Confirmação de exclusão =====
const dialogConfirmarExclusao = document.getElementById('dialog-confirmar-exclusao');
const formConfirmarExclusao = document.getElementById('form-confirmar-exclusao');
let alunoParaExcluir = null;

function abrirConfirmarExclusao(aluno) {
  alunoParaExcluir = aluno;
  document.getElementById('confirmar-exclusao-texto').textContent =
    `Isso vai remover ${aluno.nome} da lista de alunos e bloquear o acesso dele na academia. O histórico financeiro é mantido.`;
  dialogConfirmarExclusao.showModal();
}

document.getElementById('btn-confirmar-exclusao-cancelar').addEventListener('click', () => dialogConfirmarExclusao.close());

formConfirmarExclusao.addEventListener('submit', async (ev) => {
  ev.preventDefault();
  if (!alunoParaExcluir) return;
  try {
    await api.del(`/api/admin/alunos/${alunoParaExcluir.id}`);
    toast(`${alunoParaExcluir.nome} foi excluído.`, 'success');
    dialogConfirmarExclusao.close();
    carregarAlunos(document.getElementById('busca-aluno').value.trim(), paginaAtual);
  } catch (err) {
    toast(err.message || 'Erro ao excluir aluno.', 'error');
  }
});
```

- [ ] **Step 3: CSS do painel de detalhe**

Em `frontend/assets/css/admin.css`, adicionar depois do bloco `.switch-label { ... }` da Task 8:

```css
/* ===== Painel "Mais opções" (detalhe do aluno) ===== */
.admin-dialog-lg { max-width: 560px; }
.detalhe-head { display: flex; align-items: center; gap: 0.85rem; margin-bottom: 1.25rem; }
.detalhe-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.9rem; font-size: 0.88rem; margin-bottom: 1.25rem; }
.detalhe-grid .text-muted { font-size: 0.74rem; text-transform: uppercase; letter-spacing: 0.03em; display: block; margin-bottom: 0.15rem; }
.detalhe-atalhos { display: flex; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 1.5rem; }
.detalhe-frequencia h3 { font-size: 0.92rem; margin-bottom: 0.75rem; }
```

- [ ] **Step 4: Validar sintaxe do JS**

Run: `node --check frontend/assets/js/admin-alunos.js`
Expected: nenhum output.

- [ ] **Step 5: Verificação visual — preview com `api` mockado**

Criar arquivo temporário (não commitado) `frontend/admin/_preview-detalhe-aluno.html`:

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
  <button class="btn btn-primary" id="btn-abrir">Abrir painel</button>

  <dialog id="dialog-detalhe-aluno" class="admin-dialog admin-dialog-lg">
    <div id="detalhe-conteudo"></div>
  </dialog>

  <script src="../assets/js/icons.js"></script>
  <script>
    function toast(msg) { console.log('toast:', msg); }
    function escapeHtml(v) { return String(v ?? ''); }
    function iniciais(nome) { return nome.trim().split(/\s+/).slice(0, 2).map((p) => p[0].toUpperCase()).join(''); }
    function formatData(d) { return d ? new Date(d).toLocaleDateString('pt-BR', { timeZone: 'UTC' }) : '-'; }
    function fillIcons(root = document) {
      root.querySelectorAll('[data-icon]').forEach((el) => { el.innerHTML = Icons.icon(el.dataset.icon, { size: Number(el.dataset.iconSize) || 18 }); });
    }
    window.api = {
      get: async (path) => {
        if (path.includes('/frequencia')) {
          return Array.from({ length: 30 }, (_, i) => ({ data: `2026-06-${(i % 28) + 1}`, foi: Math.random() > 0.5 }));
        }
        return {
          id: 1, nome: 'Maria Teste', apelido: 'Mari', cpf: '11122233344', email: 'maria@teste.com',
          telefone: '(67) 99999-9999', plano_nome: 'Mensal', matricula_status: 'ativa',
          data_vencimento: '2026-08-20', ultima_mensalidade: '2026-07-15', controlid_user_id: null,
        };
      },
    };

    const dialogDetalhe = document.getElementById('dialog-detalhe-aluno');
    const detalheConteudo = document.getElementById('detalhe-conteudo');

    function renderFrequencia30Dias(dados) {
      const grid = document.getElementById('detalhe-frequencia-grid');
      grid.innerHTML = dados.map((d) => `<div class="freq30-dia${d.foi ? ' foi' : ''}"></div>`).join('');
    }

    function renderDetalheAluno(aluno) {
      detalheConteudo.innerHTML = `
        <div class="detalhe-head">
          <span class="avatar-fallback" style="width:56px;height:56px;font-size:1.1rem">${escapeHtml(iniciais(aluno.nome))}</span>
          <div><strong>${escapeHtml(aluno.nome)}</strong>${aluno.apelido ? `<div class="text-muted" style="font-size:.85rem">"${escapeHtml(aluno.apelido)}"</div>` : ''}</div>
        </div>
        <div class="detalhe-grid">
          <div><span class="text-muted">CPF</span><div>${escapeHtml(aluno.cpf)}</div></div>
          <div><span class="text-muted">E-mail</span><div>${escapeHtml(aluno.email)}</div></div>
          <div><span class="text-muted">Telefone</span><div>${escapeHtml(aluno.telefone)}</div></div>
          <div><span class="text-muted">Plano</span><div>${escapeHtml(aluno.plano_nome)}</div></div>
          <div><span class="text-muted">Vencimento</span><div>${formatData(aluno.data_vencimento)}</div></div>
          <div><span class="text-muted">Última mensalidade</span><div>${formatData(aluno.ultima_mensalidade)}</div></div>
        </div>
        <div class="detalhe-atalhos">
          <button type="button" class="btn btn-ghost btn-sm">${Icons.icon('refresh-cw', { size: 14 })}Renovar matrícula</button>
          <button type="button" class="btn btn-ghost btn-sm">${Icons.icon('key', { size: 14 })}Redefinir senha</button>
          <button type="button" class="btn btn-ghost btn-sm">${Icons.icon('shield-check', { size: 14 })}Vincular à catraca</button>
        </div>
        <div class="detalhe-frequencia">
          <h3>Frequência (últimos 30 dias)</h3>
          <div id="detalhe-frequencia-grid" class="freq30-grid"></div>
          <div class="freq30-legenda">
            <span class="freq30-legenda-item"><span class="freq30-legenda-dot foi"></span>Foi</span>
            <span class="freq30-legenda-item"><span class="freq30-legenda-dot"></span>Faltou</span>
          </div>
        </div>
        <div class="dialog-actions">
          <button type="button" class="btn btn-danger btn-sm">${Icons.icon('trash-2', { size: 14 })}Excluir aluno</button>
          <button type="button" class="btn btn-ghost" id="btn-fechar">Fechar</button>
        </div>
      `;
      document.getElementById('btn-fechar').addEventListener('click', () => dialogDetalhe.close());
      api.get('/api/admin/alunos/1/frequencia').then(renderFrequencia30Dias);
    }

    document.getElementById('btn-abrir').addEventListener('click', async () => {
      const aluno = await api.get('/api/admin/alunos/1');
      renderDetalheAluno(aluno);
      dialogDetalhe.showModal();
    });
  </script>
</body>
</html>
```

Subir localmente (`npx serve frontend -l 3000`), navegar pra
`http://localhost:3000/admin/_preview-detalhe-aluno.html` via Chrome DevTools
MCP, clicar em "Abrir painel", tirar screenshot. Confirmar: avatar +
nome + apelido entre aspas, grid 2 colunas com CPF/e-mail/telefone/plano/
vencimento/última mensalidade, 3 atalhos, grid de 30 quadradinhos (algum
colorido, algum cinza — random no mock), legenda, botão vermelho de excluir.

Depois, apagar `frontend/admin/_preview-detalhe-aluno.html`
(`rm frontend/admin/_preview-detalhe-aluno.html`) e confirmar com `git status`
que não sobrou nada.

- [ ] **Step 6: Commit**

```bash
git add frontend/admin/alunos.html frontend/assets/js/admin-alunos.js frontend/assets/css/admin.css
git commit -m "$(cat <<'EOF'
feat(alunos): painel "Mais opcoes" com dados completos, atalhos e exclusao

Consome GET /api/admin/alunos/:id, reune os 3 atalhos que antes eram
icones soltos na fileira (matricular/senha/catraca) e adiciona
exclusao com dialogo de confirmacao (soft-delete via DELETE
/api/admin/alunos/:id).

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Frontend — gráfico de Frequência (30 dias)

**Files:**
- Modify: `frontend/assets/js/admin-alunos.js` (função `renderFrequencia30Dias`, referenciada mas não implementada na Task 9)
- Modify: `frontend/assets/css/admin.css`

**Interfaces:**
- Consumes: `GET /api/admin/alunos/:id/frequencia` (Task 4).
- Produces: `renderFrequencia30Dias(usuarioId)`, chamada por `renderDetalheAluno` (Task 9, já tem a chamada `renderFrequencia30Dias(aluno.id)` no final da função).

- [ ] **Step 1: Implementar `renderFrequencia30Dias`**

Adicionar ao final de `frontend/assets/js/admin-alunos.js`:

```javascript
async function renderFrequencia30Dias(usuarioId) {
  const grid = document.getElementById('detalhe-frequencia-grid');
  try {
    const dias = await api.get(`/api/admin/alunos/${usuarioId}/frequencia`);
    grid.innerHTML = dias.map((d) => {
      const data = new Date(d.data);
      const label = `${String(data.getUTCDate()).padStart(2, '0')}/${String(data.getUTCMonth() + 1).padStart(2, '0')}`;
      return `<div class="freq30-dia${d.foi ? ' foi' : ''}" title="${label}${d.foi ? ' — foi' : ' — faltou'}"></div>`;
    }).join('');
  } catch {
    grid.innerHTML = '<div class="empty-state">Não foi possível carregar a frequência.</div>';
  }
}
```

- [ ] **Step 2: CSS do grid de 30 dias**

Em `frontend/assets/css/admin.css`, adicionar depois do bloco `.detalhe-frequencia h3 { ... }` da Task 9:

```css
.freq30-grid { display: grid; grid-template-columns: repeat(10, 1fr); gap: 0.3rem; }
.freq30-dia { aspect-ratio: 1; border-radius: 5px; background: var(--color-surface-2); }
.freq30-dia.foi { background: var(--color-primary); }
.freq30-legenda { display: flex; gap: 1rem; margin-top: 0.6rem; font-size: 0.76rem; color: var(--color-muted); }
.freq30-legenda-item { display: flex; align-items: center; gap: 0.35rem; }
.freq30-legenda-dot { width: 12px; height: 12px; border-radius: 3px; background: var(--color-surface-2); }
.freq30-legenda-dot.foi { background: var(--color-primary); }
```

- [ ] **Step 3: Validar sintaxe**

Run: `node --check frontend/assets/js/admin-alunos.js`
Expected: nenhum output.

- [ ] **Step 4: Verificação visual**

Repetir o preview da Task 9 Step 6 (o grid de frequência já está incluso nesse
preview — se ainda não foi apagado, só recarregar; senão, recriar
temporariamente do mesmo jeito). Confirmar visualmente: 10 colunas x 3
fileiras, quadrados coloridos vs cinza, legenda com as 2 cores explicadas
embaixo. Apagar o preview de novo ao final e confirmar `git status` limpo.

- [ ] **Step 5: Commit**

```bash
git add frontend/assets/js/admin-alunos.js frontend/assets/css/admin.css
git commit -m "$(cat <<'EOF'
feat(alunos): grafico de frequencia (30 dias) no painel "Mais opcoes"

Reaproveita a mesma linguagem visual do calendario do proprio aluno
(dashboard.css .cal-dia/.treinou) - quadrado colorido = foi, cinza
apagado = faltou - numa janela rolante de 30 dias com legenda.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Frontend — avatar compartilhado + upload de foto no perfil

**Files:**
- Modify: `frontend/assets/js/ui.js` (nova função `renderAvatar`)
- Modify: `frontend/assets/js/admin-alunos.js` (usa `renderAvatar` na tabela e no painel de detalhe)
- Modify: `frontend/assets/js/dashboard.js:51`
- Modify: `frontend/perfil.html`
- Modify: `frontend/assets/js/perfil.js`
- Modify: `frontend/assets/css/admin.css:235-241` e `frontend/assets/css/aluno.css:64-70` (`.avatar-fallback` está duplicado nos dois arquivos, um por área)

**Interfaces:**
- Produces: `renderAvatar(nome, fotoUrl, sizePx = 40): string` (retorna HTML: `<img>` se `fotoUrl`, senão `<span class="avatar-fallback">` com iniciais) — usada nos 4 lugares acima.

- [ ] **Step 1: Implementar `renderAvatar` em `ui.js`**

Em `frontend/assets/js/ui.js`, adicionar logo depois de `function iniciais(nome) { ... }` (linha 36):

```javascript
function renderAvatar(nome, fotoUrl, sizePx = 40) {
  if (fotoUrl) {
    return `<img src="${escapeHtml(fotoUrl)}" alt="${escapeHtml(nome)}" class="avatar-img" style="width:${sizePx}px;height:${sizePx}px" />`;
  }
  return `<span class="avatar-fallback" style="width:${sizePx}px;height:${sizePx}px;font-size:${Math.round(sizePx * 0.32)}px">${escapeHtml(iniciais(nome))}</span>`;
}
```

- [ ] **Step 2: CSS de `.avatar-img`**

`.avatar-fallback` está definido em 2 arquivos separados (cada página usa o
próprio CSS): `frontend/assets/css/admin.css:235-241` (admin, usado pela
Task 9/tabela) e `frontend/assets/css/aluno.css:64-70` (dashboard/perfil do
aluno, usado pela Task 11 Steps 5-6). Adicionar `.avatar-img` logo depois de
cada um dos dois blocos.

Em `frontend/assets/css/admin.css`, depois da linha 241 (`}` que fecha
`.avatar-fallback`):

```css
.avatar-img { border-radius: 50%; object-fit: cover; flex-shrink: 0; }
```

Em `frontend/assets/css/aluno.css`, depois da linha 70 (`}` que fecha
`.avatar-fallback`):

```css
.avatar-img { border-radius: 50%; object-fit: cover; flex-shrink: 0; }
```

- [ ] **Step 3: Usar `renderAvatar` na tabela de alunos**

Em `frontend/assets/js/admin-alunos.js`, dentro de `carregarAlunos`, trocar:

```javascript
                <span class="avatar-fallback">${escapeHtml(iniciais(a.nome))}</span>
```

por:

```javascript
                ${renderAvatar(a.nome, a.foto_url, 36)}
```

(Isso exige que a query de listagem em `admin.js:163` passe a selecionar `u.foto_url` também — adicionar no `SELECT` da rota `GET /alunos`, linha 163: `u.foto_url,` logo depois de `u.controlid_user_id, u.origem_externa,`.)

- [ ] **Step 4: Usar `renderAvatar` no painel de detalhe**

Em `frontend/assets/js/admin-alunos.js`, dentro de `renderDetalheAluno` (Task 9), trocar:

```javascript
      <span class="avatar-fallback" style="width:56px;height:56px;font-size:1.1rem">${escapeHtml(iniciais(aluno.nome))}</span>
```

por:

```javascript
      ${renderAvatar(aluno.nome, aluno.foto_url, 56)}
```

- [ ] **Step 5: Usar `renderAvatar` no dashboard do aluno**

Em `frontend/assets/js/dashboard.js:51`, trocar:

```javascript
    document.getElementById('profile-avatar').textContent = iniciais(d.nome);
```

por:

```javascript
    document.getElementById('profile-avatar').outerHTML = renderAvatar(d.nome, d.foto_url, 40).replace('class="avatar-fallback"', 'class="avatar-fallback" id="profile-avatar"').replace('class="avatar-img"', 'class="avatar-img" id="profile-avatar"');
```

(`outerHTML` porque o elemento pode virar `<img>` em vez de `<span>` — precisa recriar a tag inteira, não só o `textContent`.)

- [ ] **Step 6: Upload de foto em `perfil.html`**

Em `frontend/perfil.html`, dentro do `<form id="form-perfil">`, trocar o bloco do avatar (linhas 45-51 atuais):

```html
          <div class="row gap-md" style="align-items:center;margin-bottom:1.5rem">
            <span class="avatar-fallback" id="perfil-avatar" style="width:56px;height:56px;font-size:1.1rem">-</span>
            <div>
              <strong id="perfil-nome-display">-</strong>
              <div class="text-muted" style="font-size:.85rem" id="perfil-email-display">-</div>
            </div>
          </div>
```

por:

```html
          <div class="row gap-md" style="align-items:center;margin-bottom:1.5rem">
            <div id="perfil-avatar-wrap"></div>
            <div>
              <strong id="perfil-nome-display">-</strong>
              <div class="text-muted" style="font-size:.85rem" id="perfil-email-display">-</div>
              <label class="btn btn-ghost btn-sm" style="margin-top:.5rem;cursor:pointer">
                Trocar foto
                <input type="file" id="perfil-foto-input" accept="image/jpeg,image/png,image/webp" style="display:none" />
              </label>
            </div>
          </div>
```

Adicionar também, logo abaixo do campo CPF (depois da linha 70, antes do botão "Salvar alterações"), o campo de apelido:

```html
          <div class="field">
            <label for="perfil-apelido">Apelido</label>
            <input type="text" id="perfil-apelido" placeholder="Como prefere ser chamado" maxlength="60" />
          </div>
```

- [ ] **Step 7: Wire do upload + apelido em `perfil.js`**

Em `frontend/assets/js/perfil.js`, trocar a linha 6:

```javascript
    document.getElementById('perfil-avatar').textContent = iniciais(u.nome);
```

por:

```javascript
    document.getElementById('perfil-avatar-wrap').innerHTML = renderAvatar(u.nome, u.foto_url, 56);
```

Depois da linha 12 (`document.getElementById('perfil-cpf').value = u.cpf || 'Não informado';`), adicionar:

```javascript
    document.getElementById('perfil-apelido').value = u.apelido || '';
```

No handler de submit (linhas 53-71), adicionar `apelido` ao PATCH (dentro do objeto enviado em `api.patch('/api/alunos/perfil', {...})`, linha 59-63):

```javascript
    await api.patch('/api/alunos/perfil', {
      nome: document.getElementById('perfil-nome').value.trim(),
      telefone: document.getElementById('perfil-telefone').value.trim(),
      data_nascimento: document.getElementById('perfil-nascimento').value || null,
      apelido: document.getElementById('perfil-apelido').value.trim() || null,
    });
```

Adicionar, no final do arquivo (depois de `carregarPerfil();`, linha 73), o listener de upload:

```javascript
document.getElementById('perfil-foto-input').addEventListener('change', async (ev) => {
  const arquivo = ev.target.files[0];
  if (!arquivo) return;

  const formData = new FormData();
  formData.append('foto', arquivo);

  try {
    const token = localStorage.getItem('token');
    const resposta = await fetch(`${API_URL}/api/alunos/perfil/foto`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: formData,
    });
    if (!resposta.ok) {
      const erro = await resposta.json();
      throw new Error(erro.error || 'Erro ao enviar foto');
    }
    toast('Foto atualizada!', 'success');
    carregarPerfil();
  } catch (err) {
    toast(err.message || 'Erro ao enviar foto.', 'error');
  } finally {
    ev.target.value = '';
  }
});
```

(Upload usa `fetch` direto, não `api.post`, porque `apiFetch` em
`frontend/assets/js/api.js:9-24` sempre serializa o body com `JSON.stringify`
e força `Content-Type: application/json` — quebraria o `multipart/form-data`
do upload. Usa a constante `API_URL` que `api.js:5-7` já define no escopo
global do script — não é relativo à origem da página, porque o front (Cloudflare
Pages) e o backend (Railway) são hosts diferentes; `api.js` é carregado antes de
`perfil.js` em `perfil.html:86-91`, então `API_URL` já existe quando este
código roda.)

- [ ] **Step 8: Validar sintaxe de todos os JS tocados**

Run: `node --check frontend/assets/js/ui.js && node --check frontend/assets/js/admin-alunos.js && node --check frontend/assets/js/dashboard.js && node --check frontend/assets/js/perfil.js`
Expected: nenhum output.

- [ ] **Step 9: Rodar a suíte de backend inteira de novo (garantir que nada quebrou com as mudanças de query da listagem)**

Run: `cd backend && NODE_ENV=test npx jest --runInBand --forceExit`
Expected: PASS (todas as suítes).

- [ ] **Step 10: Commit**

```bash
git add frontend/assets/js/ui.js frontend/assets/js/admin-alunos.js frontend/assets/js/dashboard.js frontend/perfil.html frontend/assets/js/perfil.js frontend/assets/css/admin.css frontend/assets/css/aluno.css backend/src/routes/admin.js
git commit -m "$(cat <<'EOF'
feat(perfil): avatar com foto real (renderAvatar compartilhado) + upload no perfil do aluno

renderAvatar() centraliza a logica de mostrar foto ou iniciais,
reaproveitado na tabela de alunos do admin, no painel "Mais opcoes",
no dashboard do aluno e no proprio perfil. Perfil do aluno ganha input
de upload (conectado ao endpoint da Task 7) e campo de apelido.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```
