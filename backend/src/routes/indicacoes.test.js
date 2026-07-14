const request = require('supertest');
const app = require('../server');
const pool = require('../config/db');
const { criarUsuario, gerarToken } = require('../testUtils/fixtures');

afterAll(async () => {
  await pool.end();
});

describe('GET /api/indicacoes/meu-link, /minhas e /stats', () => {
  test('retorna o link de indicação do usuário autenticado', async () => {
    const aluno = await criarUsuario({ role: 'aluno' });
    const res = await request(app)
      .get('/api/indicacoes/meu-link')
      .set('Authorization', `Bearer ${gerarToken(aluno)}`);

    expect(res.status).toBe(200);
    expect(res.body.codigo).toBe(aluno.link_indicacao);
    expect(res.body.link).toContain(aluno.link_indicacao);

    await pool.query('DELETE FROM usuarios WHERE id = $1', [aluno.id]);
  });

  test('lista indicações e contabiliza stats por status', async () => {
    const indicador = await criarUsuario({ role: 'aluno' });
    const indicado = await criarUsuario({ role: 'aluno' });
    await pool.query(
      `INSERT INTO indicacoes (indicador_id, status) VALUES ($1, 'pendente')`,
      [indicador.id]
    );
    await pool.query(
      `INSERT INTO indicacoes (indicador_id, status, convertido_em) VALUES ($1, 'convertido', NOW())`,
      [indicador.id]
    );

    const minhas = await request(app)
      .get('/api/indicacoes/minhas')
      .set('Authorization', `Bearer ${gerarToken(indicador)}`);
    expect(minhas.status).toBe(200);
    expect(minhas.body.length).toBe(2);

    const stats = await request(app)
      .get('/api/indicacoes/stats')
      .set('Authorization', `Bearer ${gerarToken(indicador)}`);
    expect(stats.status).toBe(200);
    expect(stats.body.total).toBe(2);
    expect(stats.body.convertidos).toBe(1);
    expect(stats.body.pendentes).toBe(1);

    await pool.query('DELETE FROM indicacoes WHERE indicador_id = $1', [indicador.id]);
    await pool.query('DELETE FROM usuarios WHERE id = ANY($1)', [[indicador.id, indicado.id]]);
  });

  test('rejeita sem autenticação', async () => {
    const res = await request(app).get('/api/indicacoes/minhas');
    expect(res.status).toBe(401);
  });
});

describe('GET /api/indicacoes/ref/:codigo (público)', () => {
  test('retorna dados do indicador ativo pelo código', async () => {
    const indicador = await criarUsuario({ role: 'aluno' });

    const res = await request(app).get(`/api/indicacoes/ref/${indicador.link_indicacao}`);
    expect(res.status).toBe(200);
    expect(res.body.indicador.nome).toBe(indicador.nome);
    expect(res.body.codigo).toBe(indicador.link_indicacao);

    await pool.query('DELETE FROM usuarios WHERE id = $1', [indicador.id]);
  });

  test('404 para código inexistente', async () => {
    const res = await request(app).get('/api/indicacoes/ref/codigo-que-nao-existe');
    expect(res.status).toBe(404);
  });
});
