const request = require('supertest');
const app = require('../server');
const pool = require('../config/db');
const { criarUsuario, criarAula, gerarToken } = require('../testUtils/fixtures');

afterAll(async () => {
  await pool.end();
});

describe('GET /api/aulas', () => {
  test('retorna a grade pública agrupada por dia, sem aulas inativas', async () => {
    const ativa = await criarAula({ nome: 'Spinning Teste', dia_semana: 1 });
    const inativa = await criarAula({ nome: 'Aula Inativa Teste', dia_semana: 1, ativo: false });

    const res = await request(app).get('/api/aulas');

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(7);
    const segunda = res.body.find((d) => d.dia === 'Segunda');
    expect(segunda.aulas.some((a) => a.id === ativa.id)).toBe(true);
    expect(segunda.aulas.some((a) => a.id === inativa.id)).toBe(false);

    await pool.query('DELETE FROM aulas WHERE id = ANY($1)', [[ativa.id, inativa.id]]);
  });
});

describe('GET /api/aulas/admin e /professores', () => {
  test('rejeita sem role admin/dono', async () => {
    const aluno = await criarUsuario({ role: 'aluno' });
    const res = await request(app)
      .get('/api/aulas/admin')
      .set('Authorization', `Bearer ${gerarToken(aluno)}`);
    expect(res.status).toBe(403);

    await pool.query('DELETE FROM usuarios WHERE id = $1', [aluno.id]);
  });

  test('admin vê grade completa (inclui inativas) com nome do dia', async () => {
    const admin = await criarUsuario({ role: 'admin' });
    const inativa = await criarAula({ nome: 'Aula Inativa Admin Teste', ativo: false });

    const res = await request(app)
      .get('/api/aulas/admin')
      .set('Authorization', `Bearer ${gerarToken(admin)}`);

    expect(res.status).toBe(200);
    const encontrada = res.body.find((a) => a.id === inativa.id);
    expect(encontrada).toBeDefined();
    expect(encontrada.dia_semana_nome).toBeDefined();

    await pool.query('DELETE FROM aulas WHERE id = $1', [inativa.id]);
    await pool.query('DELETE FROM usuarios WHERE id = $1', [admin.id]);
  });

  test('lista só professores ativos', async () => {
    const admin = await criarUsuario({ role: 'admin' });
    const professor = await criarUsuario({ role: 'professor' });

    const res = await request(app)
      .get('/api/aulas/professores')
      .set('Authorization', `Bearer ${gerarToken(admin)}`);

    expect(res.status).toBe(200);
    expect(res.body.some((p) => p.id === professor.id)).toBe(true);

    await pool.query('DELETE FROM usuarios WHERE id = ANY($1)', [[admin.id, professor.id]]);
  });
});

describe('POST /api/aulas, PUT /api/aulas/:id e PATCH /toggle', () => {
  test('admin cria, atualiza e alterna o status de uma aula', async () => {
    const admin = await criarUsuario({ role: 'admin' });

    const criacao = await request(app)
      .post('/api/aulas')
      .set('Authorization', `Bearer ${gerarToken(admin)}`)
      .send({ nome: 'Crossfit Teste', dia_semana: 2, hora_inicio: '08:00', hora_fim: '09:00' });
    expect(criacao.status).toBe(201);
    const aulaId = criacao.body.id;

    const atualizacao = await request(app)
      .put(`/api/aulas/${aulaId}`)
      .set('Authorization', `Bearer ${gerarToken(admin)}`)
      .send({ capacidade_maxima: 30 });
    expect(atualizacao.status).toBe(200);
    expect(atualizacao.body.capacidade_maxima).toBe(30);
    expect(atualizacao.body.nome).toBe('Crossfit Teste');

    const toggle = await request(app)
      .patch(`/api/aulas/${aulaId}/toggle`)
      .set('Authorization', `Bearer ${gerarToken(admin)}`);
    expect(toggle.status).toBe(200);
    expect(toggle.body.ativo).toBe(false);

    const toggleInexistente = await request(app)
      .patch('/api/aulas/999999999/toggle')
      .set('Authorization', `Bearer ${gerarToken(admin)}`);
    expect(toggleInexistente.status).toBe(404);

    await pool.query('DELETE FROM aulas WHERE id = $1', [aulaId]);
    await pool.query('DELETE FROM usuarios WHERE id = $1', [admin.id]);
  });
});
