const request = require('supertest');
const app = require('../server');
const pool = require('../config/db');
const { criarUsuario, gerarToken } = require('../testUtils/fixtures');

afterAll(async () => {
  await pool.end();
});

describe('GET /api/ranking', () => {
  test('rejeita sem autenticação', async () => {
    const res = await request(app).get('/api/ranking');
    expect(res.status).toBe(401);
  });

  test('lista alunos ordenados por treinos/xp e inclui minha_posicao', async () => {
    const aluno = await criarUsuario({ role: 'aluno' });
    await pool.query('UPDATE usuarios SET xp = 500 WHERE id = $1', [aluno.id]);

    const res = await request(app)
      .get('/api/ranking?tipo=geral')
      .set('Authorization', `Bearer ${gerarToken(aluno)}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body.ranking)).toBe(true);
    expect(res.body.minha_posicao).not.toBeNull();
    expect(res.body.minha_posicao.id).toBe(aluno.id);

    await pool.query('DELETE FROM usuarios WHERE id = $1', [aluno.id]);
  });
});

describe('GET /api/ranking/conquistas/:usuarioId', () => {
  test('retorna a lista de conquistas com status de desbloqueio', async () => {
    const aluno = await criarUsuario({ role: 'aluno' });
    const res = await request(app)
      .get(`/api/ranking/conquistas/${aluno.id}`)
      .set('Authorization', `Bearer ${gerarToken(aluno)}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.length).toBeGreaterThan(0);
    expect(res.body[0]).toHaveProperty('desbloqueada_em');

    await pool.query('DELETE FROM usuarios WHERE id = $1', [aluno.id]);
  });
});
