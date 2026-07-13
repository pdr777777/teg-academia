const request = require('supertest');
const app = require('../server');
const pool = require('../config/db');
const { criarUsuario, criarPlano, criarMatricula, gerarToken } = require('../testUtils/fixtures');

describe('GET /api/alunos/dashboard e /perfil — matrícula suspensa continua visível', () => {
  afterAll(async () => {
    await pool.end();
  });

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
});
