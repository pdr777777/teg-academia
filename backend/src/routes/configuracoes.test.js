const request = require('supertest');
const app = require('../server');
const pool = require('../config/db');
const { criarUsuario, gerarToken } = require('../testUtils/fixtures');

describe('PATCH /api/configuracoes', () => {
  afterAll(async () => {
    await pool.query('UPDATE configuracoes SET dias_tolerancia_bloqueio = 5, catraca_ativa = TRUE WHERE id = 1');
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
});
