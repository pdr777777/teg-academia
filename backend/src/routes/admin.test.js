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
