const request = require('supertest');
const app = require('../server');
const pool = require('../config/db');
const { criarUsuario, criarPlano, gerarToken } = require('../testUtils/fixtures');

afterAll(async () => {
  await pool.end();
});

describe('GET /api/planos', () => {
  test('lista só planos ativos, público, sem autenticação', async () => {
    const ativo = await criarPlano({ nome: 'Plano Ativo Teste' });
    const inativo = await criarPlano({ nome: 'Plano Inativo Teste' });
    await pool.query('UPDATE planos SET ativo = FALSE WHERE id = $1', [inativo.id]);

    const res = await request(app).get('/api/planos');

    expect(res.status).toBe(200);
    expect(res.body.some((p) => p.id === ativo.id)).toBe(true);
    expect(res.body.some((p) => p.id === inativo.id)).toBe(false);

    await pool.query('DELETE FROM planos WHERE id = ANY($1)', [[ativo.id, inativo.id]]);
  });
});

describe('POST /api/planos', () => {
  test('rejeita sem autenticação', async () => {
    const res = await request(app).post('/api/planos').send({ nome: 'X', preco_mensal: 100 });
    expect(res.status).toBe(401);
  });

  test('rejeita aluno comum (403)', async () => {
    const aluno = await criarUsuario({ role: 'aluno' });
    const res = await request(app)
      .post('/api/planos')
      .set('Authorization', `Bearer ${gerarToken(aluno)}`)
      .send({ nome: 'X', preco_mensal: 100 });
    expect(res.status).toBe(403);

    await pool.query('DELETE FROM usuarios WHERE id = $1', [aluno.id]);
  });

  test('admin cria plano com sucesso', async () => {
    const admin = await criarUsuario({ role: 'admin' });
    const res = await request(app)
      .post('/api/planos')
      .set('Authorization', `Bearer ${gerarToken(admin)}`)
      .send({ nome: 'Plano Premium Teste', descricao: 'desc', preco_mensal: 199.9, duracao_dias: 30 });

    expect(res.status).toBe(201);
    expect(res.body.nome).toBe('Plano Premium Teste');

    await pool.query('DELETE FROM planos WHERE id = $1', [res.body.id]);
    await pool.query('DELETE FROM usuarios WHERE id = $1', [admin.id]);
  });
});

describe('PUT /api/planos/:id', () => {
  test('atualiza campos parcialmente (COALESCE) e 404 se não existir', async () => {
    const admin = await criarUsuario({ role: 'admin' });
    const plano = await criarPlano({ nome: 'Plano Original', preco_mensal: 100 });

    const res = await request(app)
      .put(`/api/planos/${plano.id}`)
      .set('Authorization', `Bearer ${gerarToken(admin)}`)
      .send({ preco_mensal: 150 });

    expect(res.status).toBe(200);
    expect(res.body.nome).toBe('Plano Original');
    expect(Number(res.body.preco_mensal)).toBe(150);

    const inexistente = await request(app)
      .put('/api/planos/999999999')
      .set('Authorization', `Bearer ${gerarToken(admin)}`)
      .send({ preco_mensal: 150 });
    expect(inexistente.status).toBe(404);

    await pool.query('DELETE FROM planos WHERE id = $1', [plano.id]);
    await pool.query('DELETE FROM usuarios WHERE id = $1', [admin.id]);
  });
});
