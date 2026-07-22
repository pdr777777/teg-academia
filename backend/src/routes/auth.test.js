const request = require('supertest');
const crypto = require('crypto');
const app = require('../server');
const pool = require('../config/db');
const { criarUsuario, criarPlano, gerarToken } = require('../testUtils/fixtures');

function emailUnico() {
  return `${crypto.randomUUID()}@teste.com`;
}

afterAll(async () => {
  await pool.end();
});

describe('POST /api/auth/registro', () => {
  test('cria usuário com dados válidos', async () => {
    const email = emailUnico();
    const res = await request(app).post('/api/auth/registro').send({
      nome: 'Novo Aluno',
      email,
      senha: 'senha1234',
    });

    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.email).toBe(email);

    await pool.query('DELETE FROM usuarios WHERE email = $1', [email]);
  });

  test('rejeita quando falta campo obrigatório', async () => {
    const res = await request(app).post('/api/auth/registro').send({ email: emailUnico(), senha: 'senha1234' });
    expect(res.status).toBe(400);
  });

  test('rejeita senha fraca (sem número)', async () => {
    const res = await request(app).post('/api/auth/registro').send({
      nome: 'Teste',
      email: emailUnico(),
      senha: 'somenteletras',
    });
    expect(res.status).toBe(400);
  });

  test('rejeita e-mail duplicado', async () => {
    const usuario = await criarUsuario();
    const res = await request(app).post('/api/auth/registro').send({
      nome: 'Duplicado',
      email: usuario.email,
      senha: 'senha1234',
    });
    expect(res.status).toBe(409);

    await pool.query('DELETE FROM usuarios WHERE id = $1', [usuario.id]);
  });

  test('rejeita e-mail com formato inválido', async () => {
    const res = await request(app).post('/api/auth/registro').send({
      nome: 'Teste',
      email: 'nao-e-email',
      senha: 'senha1234',
    });
    expect(res.status).toBe(400);
  });

  test('rejeita telefone com formato inválido quando informado', async () => {
    const res = await request(app).post('/api/auth/registro').send({
      nome: 'Teste',
      email: emailUnico(),
      senha: 'senha1234',
      telefone: '123',
    });
    expect(res.status).toBe(400);
  });

  test('rejeita CPF com dígito verificador inválido quando informado', async () => {
    const res = await request(app).post('/api/auth/registro').send({
      nome: 'Teste',
      email: emailUnico(),
      senha: 'senha1234',
      cpf: '111.111.111-11',
    });
    expect(res.status).toBe(400);
  });

  test('aceita cadastro sem telefone/cpf (campos opcionais)', async () => {
    const email = emailUnico();
    const res = await request(app).post('/api/auth/registro').send({
      nome: 'Sem Telefone',
      email,
      senha: 'senha1234',
    });
    expect(res.status).toBe(201);
    await pool.query('DELETE FROM usuarios WHERE email = $1', [email]);
  });

  test('rejeita quando plano_id não existe/está inativo (não cria o usuário)', async () => {
    const email = emailUnico();
    const planoInativo = await criarPlano({ nome: 'Plano Inativo Registro Teste' });
    await pool.query('UPDATE planos SET ativo = FALSE WHERE id = $1', [planoInativo.id]);

    const res = await request(app).post('/api/auth/registro').send({
      nome: 'Teste Plano Inativo',
      email,
      senha: 'senha1234',
      plano_id: planoInativo.id,
    });
    expect(res.status).toBe(404);

    const { rows } = await pool.query('SELECT id FROM usuarios WHERE email = $1', [email]);
    expect(rows.length).toBe(0);

    await pool.query('DELETE FROM planos WHERE id = $1', [planoInativo.id]);
  });

  test('com plano_id, cria matrícula suspensa + pagamento pendente (some da lista de ativos até confirmar pagamento)', async () => {
    const email = emailUnico();
    const plano = await criarPlano({ nome: 'Plano Registro Teste', preco_mensal: 99.9, duracao_dias: 365 });

    const res = await request(app).post('/api/auth/registro').send({
      nome: 'Aluno Com Plano',
      email,
      senha: 'senha1234',
      plano_id: plano.id,
    });

    expect(res.status).toBe(201);
    expect(res.body.matricula).toBeDefined();
    expect(res.body.matricula.plano_id).toBe(plano.id);
    expect(res.body.matricula.status).toBe('suspensa');

    const { rows: [pagamento] } = await pool.query(
      'SELECT * FROM pagamentos WHERE matricula_id = $1', [res.body.matricula.id]
    );
    expect(pagamento.status).toBe('pendente');
    expect(Number(pagamento.valor)).toBe(Number(plano.preco_mensal));

    await pool.query('DELETE FROM pagamentos WHERE matricula_id = $1', [res.body.matricula.id]);
    await pool.query('DELETE FROM matriculas WHERE id = $1', [res.body.matricula.id]);
    await pool.query('DELETE FROM planos WHERE id = $1', [plano.id]);
    await pool.query('DELETE FROM usuarios WHERE email = $1', [email]);
  });
});

describe('POST /api/auth/login', () => {
  test('autentica com credenciais corretas', async () => {
    const usuario = await criarUsuario();
    const res = await request(app).post('/api/auth/login').send({
      email: usuario.email,
      senha: 'senha1234',
    });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.user.email).toBe(usuario.email);

    await pool.query('DELETE FROM usuarios WHERE id = $1', [usuario.id]);
  });

  test('rejeita e-mail que não existe (regressão: painel admin não pode logar com gmail inexistente)', async () => {
    const res = await request(app).post('/api/auth/login').send({
      email: emailUnico(),
      senha: 'qualquer-senha-123',
    });

    expect(res.status).toBe(401);
    expect(res.body.token).toBeUndefined();
  });

  test('rejeita senha incorreta', async () => {
    const usuario = await criarUsuario();
    const res = await request(app).post('/api/auth/login').send({
      email: usuario.email,
      senha: 'senhaErrada123',
    });

    expect(res.status).toBe(401);

    await pool.query('DELETE FROM usuarios WHERE id = $1', [usuario.id]);
  });

  test('rejeita usuário inativo mesmo com senha correta', async () => {
    const usuario = await criarUsuario();
    await pool.query('UPDATE usuarios SET ativo = FALSE WHERE id = $1', [usuario.id]);

    const res = await request(app).post('/api/auth/login').send({
      email: usuario.email,
      senha: 'senha1234',
    });

    expect(res.status).toBe(401);

    await pool.query('DELETE FROM usuarios WHERE id = $1', [usuario.id]);
  });

  test('rejeita quando falta email ou senha', async () => {
    const res = await request(app).post('/api/auth/login').send({ email: emailUnico() });
    expect(res.status).toBe(400);
  });

  test('bloqueia a conta após 5 tentativas erradas seguidas', async () => {
    const usuario = await criarUsuario();

    let ultimaResposta;
    for (let i = 0; i < 5; i++) {
      ultimaResposta = await request(app).post('/api/auth/login').send({
        email: usuario.email,
        senha: 'senhaErrada123',
      });
    }

    expect(ultimaResposta.status).toBe(429);
    expect(ultimaResposta.body.bloqueado).toBe(true);
    expect(ultimaResposta.body.bloqueado_ate).toBeDefined();

    await pool.query('DELETE FROM usuarios WHERE id = $1', [usuario.id]);
  });

  test('rejeita até a senha correta enquanto a conta está bloqueada', async () => {
    const usuario = await criarUsuario();

    for (let i = 0; i < 5; i++) {
      await request(app).post('/api/auth/login').send({ email: usuario.email, senha: 'senhaErrada123' });
    }

    const comSenhaCorreta = await request(app).post('/api/auth/login').send({
      email: usuario.email,
      senha: 'senha1234',
    });

    expect(comSenhaCorreta.status).toBe(429);
    expect(comSenhaCorreta.body.token).toBeUndefined();

    await pool.query('DELETE FROM usuarios WHERE id = $1', [usuario.id]);
  });

  test('login bem-sucedido zera o contador de tentativas erradas', async () => {
    const usuario = await criarUsuario();

    await request(app).post('/api/auth/login').send({ email: usuario.email, senha: 'senhaErrada123' });
    await request(app).post('/api/auth/login').send({ email: usuario.email, senha: 'senhaErrada123' });

    const sucesso = await request(app).post('/api/auth/login').send({ email: usuario.email, senha: 'senha1234' });
    expect(sucesso.status).toBe(200);

    const { rows } = await pool.query('SELECT tentativas_login_falhas FROM usuarios WHERE id = $1', [usuario.id]);
    expect(rows[0].tentativas_login_falhas).toBe(0);

    await pool.query('DELETE FROM usuarios WHERE id = $1', [usuario.id]);
  });

  test('desbloqueia quando o bloqueio expira', async () => {
    const usuario = await criarUsuario();

    for (let i = 0; i < 5; i++) {
      await request(app).post('/api/auth/login').send({ email: usuario.email, senha: 'senhaErrada123' });
    }
    // simula o cooldown já vencido, sem esperar 10 minutos de verdade.
    // Margem generosa (20min) porque o relógio da máquina de dev local pode
    // divergir de alguns minutos em relação ao servidor do Postgres (Supabase);
    // em produção os dois relógios são sincronizados via NTP normalmente.
    await pool.query(
      "UPDATE usuarios SET bloqueado_ate = NOW() - INTERVAL '20 minutes' WHERE id = $1",
      [usuario.id]
    );

    const res = await request(app).post('/api/auth/login').send({ email: usuario.email, senha: 'senha1234' });
    expect(res.status).toBe(200);

    await pool.query('DELETE FROM usuarios WHERE id = $1', [usuario.id]);
  });
});

describe('GET /api/auth/me', () => {
  test('retorna dados do usuário autenticado', async () => {
    const usuario = await criarUsuario();
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${gerarToken(usuario)}`);

    expect(res.status).toBe(200);
    expect(res.body.email).toBe(usuario.email);

    await pool.query('DELETE FROM usuarios WHERE id = $1', [usuario.id]);
  });

  test('rejeita sem token', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  test('rejeita token de usuário já removido/inativo', async () => {
    const usuario = await criarUsuario();
    const token = gerarToken(usuario);
    await pool.query('DELETE FROM usuarios WHERE id = $1', [usuario.id]);

    const res = await request(app).get('/api/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(401);
  });
});

describe('PATCH /api/auth/senha', () => {
  test('rejeita senha atual incorreta', async () => {
    const usuario = await criarUsuario();
    const res = await request(app)
      .patch('/api/auth/senha')
      .set('Authorization', `Bearer ${gerarToken(usuario)}`)
      .send({ senha_atual: 'errada12345', nova_senha: 'novaSenha123' });

    expect(res.status).toBe(401);

    await pool.query('DELETE FROM usuarios WHERE id = $1', [usuario.id]);
  });

  test('troca a senha e invalida tokens antigos', async () => {
    const usuario = await criarUsuario();
    const tokenAntigo = gerarToken(usuario);

    const res = await request(app)
      .patch('/api/auth/senha')
      .set('Authorization', `Bearer ${tokenAntigo}`)
      .send({ senha_atual: 'senha1234', nova_senha: 'novaSenha123' });

    expect(res.status).toBe(200);

    const resComTokenAntigo = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${tokenAntigo}`);
    expect(resComTokenAntigo.status).toBe(401);

    const loginComNovaSenha = await request(app)
      .post('/api/auth/login')
      .send({ email: usuario.email, senha: 'novaSenha123' });
    expect(loginComNovaSenha.status).toBe(200);

    await pool.query('DELETE FROM usuarios WHERE id = $1', [usuario.id]);
  });
});

describe('POST /api/auth/esqueci-senha e /redefinir-senha', () => {
  test('não revela se o e-mail existe (mesma mensagem sempre)', async () => {
    const inexistente = await request(app).post('/api/auth/esqueci-senha').send({ email: emailUnico() });
    expect(inexistente.status).toBe(200);

    const usuario = await criarUsuario();
    const existente = await request(app).post('/api/auth/esqueci-senha').send({ email: usuario.email });
    expect(existente.status).toBe(200);
    expect(existente.body.mensagem).toBe(inexistente.body.mensagem);

    await pool.query('DELETE FROM usuarios WHERE id = $1', [usuario.id]);
  });

  test('rejeita token de redefinição inválido', async () => {
    const res = await request(app)
      .post('/api/auth/redefinir-senha')
      .send({ token: 'token-invalido', novaSenha: 'novaSenha123' });

    expect(res.status).toBe(400);
  });

  test('redefine a senha com token válido e o token não pode ser reutilizado', async () => {
    const usuario = await criarUsuario();
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    await pool.query(
      'UPDATE usuarios SET reset_token_hash = $1, reset_token_expira = $2 WHERE id = $3',
      [tokenHash, new Date(Date.now() + 60 * 60 * 1000), usuario.id]
    );

    const res = await request(app)
      .post('/api/auth/redefinir-senha')
      .send({ token, novaSenha: 'senhaResetada123' });
    expect(res.status).toBe(200);

    const loginComNovaSenha = await request(app)
      .post('/api/auth/login')
      .send({ email: usuario.email, senha: 'senhaResetada123' });
    expect(loginComNovaSenha.status).toBe(200);

    const reuso = await request(app)
      .post('/api/auth/redefinir-senha')
      .send({ token, novaSenha: 'outraSenha123' });
    expect(reuso.status).toBe(400);

    await pool.query('DELETE FROM usuarios WHERE id = $1', [usuario.id]);
  });

  test('rejeita token de redefinição expirado', async () => {
    const usuario = await criarUsuario();
    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    await pool.query(
      'UPDATE usuarios SET reset_token_hash = $1, reset_token_expira = $2 WHERE id = $3',
      [tokenHash, new Date(Date.now() - 60 * 1000), usuario.id]
    );

    const res = await request(app)
      .post('/api/auth/redefinir-senha')
      .send({ token, novaSenha: 'senhaResetada123' });
    expect(res.status).toBe(400);

    await pool.query('DELETE FROM usuarios WHERE id = $1', [usuario.id]);
  });

  test('redefinir a senha desbloqueia a conta', async () => {
    const usuario = await criarUsuario();
    for (let i = 0; i < 5; i++) {
      await request(app).post('/api/auth/login').send({ email: usuario.email, senha: 'senhaErrada123' });
    }
    const { rows: [antes] } = await pool.query('SELECT bloqueado_ate FROM usuarios WHERE id = $1', [usuario.id]);
    expect(antes.bloqueado_ate).not.toBeNull();

    const token = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    await pool.query(
      'UPDATE usuarios SET reset_token_hash = $1, reset_token_expira = $2 WHERE id = $3',
      [tokenHash, new Date(Date.now() + 60 * 60 * 1000), usuario.id]
    );
    await request(app).post('/api/auth/redefinir-senha').send({ token, novaSenha: 'senhaResetada123' });

    const res = await request(app).post('/api/auth/login').send({ email: usuario.email, senha: 'senhaResetada123' });
    expect(res.status).toBe(200);

    await pool.query('DELETE FROM usuarios WHERE id = $1', [usuario.id]);
  });
});
