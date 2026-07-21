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
