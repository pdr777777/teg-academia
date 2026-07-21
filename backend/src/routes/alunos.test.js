const request = require('supertest');
const app = require('../server');
const pool = require('../config/db');
const { criarUsuario, criarPlano, criarMatricula, gerarToken } = require('../testUtils/fixtures');

describe('GET /api/alunos/dashboard e /perfil — matrícula suspensa continua visível', () => {
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

  test('dashboard mostra a matrícula MAIS RECENTE quando o aluno tem mais de uma', async () => {
    const aluno = await criarUsuario();
    const planoAntigo = await criarPlano({ nome: 'Plano Antigo Cancelado' });
    const planoNovo = await criarPlano({ nome: 'Plano Novo Vencido' });

    // Matrícula antiga (criada primeiro, created_at menor)
    const matriculaAntiga = await criarMatricula({
      usuario_id: aluno.id, plano_id: planoAntigo.id, status: 'cancelada',
      data_vencimento: new Date(Date.now() - 100 * 86400000),
    });

    // Matrícula nova (criada depois, created_at maior) — é essa que deve aparecer
    const matriculaNova = await criarMatricula({
      usuario_id: aluno.id, plano_id: planoNovo.id, status: 'vencida',
      data_vencimento: new Date(Date.now() - 5 * 86400000),
    });

    const res = await request(app)
      .get('/api/alunos/dashboard')
      .set('Authorization', `Bearer ${gerarToken(aluno)}`);

    expect(res.status).toBe(200);
    expect(res.body.matricula_status).toBe('vencida');
    expect(res.body.plano_nome).toBe('Plano Novo Vencido');
    expect(new Date(res.body.data_vencimento).toISOString()).toBe(
      new Date(matriculaNova.data_vencimento).toISOString()
    );

    await pool.query('DELETE FROM matriculas WHERE id = ANY($1)', [[matriculaAntiga.id, matriculaNova.id]]);
    await pool.query('DELETE FROM usuarios WHERE id = $1', [aluno.id]);
    await pool.query('DELETE FROM planos WHERE id = ANY($1)', [[planoAntigo.id, planoNovo.id]]);
  });
});

describe('notificacoes_whatsapp — preferência de notificação', () => {
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

afterAll(async () => {
  await pool.end();
});
