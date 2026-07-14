const request = require('supertest');
const app = require('../server');
const pool = require('../config/db');
const { criarUsuario, gerarToken } = require('../testUtils/fixtures');

afterAll(async () => {
  await pool.end();
});

describe('GET /api/equipe', () => {
  test('rejeita quem não é dono (admin incluso)', async () => {
    const admin = await criarUsuario({ role: 'admin' });
    const res = await request(app)
      .get('/api/equipe')
      .set('Authorization', `Bearer ${gerarToken(admin)}`);
    expect(res.status).toBe(403);

    await pool.query('DELETE FROM usuarios WHERE id = $1', [admin.id]);
  });

  test('dono lista membros da equipe (admin/professor), sem alunos', async () => {
    const dono = await criarUsuario({ role: 'dono' });
    const professor = await criarUsuario({ role: 'professor' });
    const aluno = await criarUsuario({ role: 'aluno' });

    const res = await request(app)
      .get('/api/equipe')
      .set('Authorization', `Bearer ${gerarToken(dono)}`);

    expect(res.status).toBe(200);
    expect(res.body.some((u) => u.id === professor.id)).toBe(true);
    expect(res.body.some((u) => u.id === aluno.id)).toBe(false);

    await pool.query('DELETE FROM usuarios WHERE id = ANY($1)', [[dono.id, professor.id, aluno.id]]);
  });
});

describe('POST /api/equipe', () => {
  test('valida campos obrigatórios, role e força de senha', async () => {
    const dono = await criarUsuario({ role: 'dono' });

    const semCampos = await request(app)
      .post('/api/equipe')
      .set('Authorization', `Bearer ${gerarToken(dono)}`)
      .send({ nome: 'X' });
    expect(semCampos.status).toBe(400);

    const roleInvalida = await request(app)
      .post('/api/equipe')
      .set('Authorization', `Bearer ${gerarToken(dono)}`)
      .send({ nome: 'X', email: 'x@teste.com', senha: 'senha1234', role: 'dono' });
    expect(roleInvalida.status).toBe(400);

    const senhaFraca = await request(app)
      .post('/api/equipe')
      .set('Authorization', `Bearer ${gerarToken(dono)}`)
      .send({ nome: 'X', email: 'y@teste.com', senha: 'fraca', role: 'admin' });
    expect(senhaFraca.status).toBe(400);

    await pool.query('DELETE FROM usuarios WHERE id = $1', [dono.id]);
  });

  test('cria membro admin/professor com sucesso', async () => {
    const dono = await criarUsuario({ role: 'dono' });
    const res = await request(app)
      .post('/api/equipe')
      .set('Authorization', `Bearer ${gerarToken(dono)}`)
      .send({ nome: 'Novo Professor', email: `${Date.now()}@teste.com`, senha: 'senha1234', role: 'professor' });

    expect(res.status).toBe(201);
    expect(res.body.role).toBe('professor');
    expect(res.body.senha_hash).toBeUndefined();

    await pool.query('DELETE FROM usuarios WHERE id = $1', [res.body.id]);
    await pool.query('DELETE FROM usuarios WHERE id = $1', [dono.id]);
  });
});

describe('PATCH /api/equipe/:id/toggle e /senha', () => {
  test('alterna ativo/inativo e 404 para id que não é da equipe', async () => {
    const dono = await criarUsuario({ role: 'dono' });
    const professor = await criarUsuario({ role: 'professor' });
    const aluno = await criarUsuario({ role: 'aluno' });

    const toggle = await request(app)
      .patch(`/api/equipe/${professor.id}/toggle`)
      .set('Authorization', `Bearer ${gerarToken(dono)}`);
    expect(toggle.status).toBe(200);
    expect(toggle.body.ativo).toBe(false);

    const toggleAluno = await request(app)
      .patch(`/api/equipe/${aluno.id}/toggle`)
      .set('Authorization', `Bearer ${gerarToken(dono)}`);
    expect(toggleAluno.status).toBe(404);

    await pool.query('DELETE FROM usuarios WHERE id = ANY($1)', [[dono.id, professor.id, aluno.id]]);
  });

  test('troca a senha de um membro da equipe', async () => {
    const dono = await criarUsuario({ role: 'dono' });
    const professor = await criarUsuario({ role: 'professor' });

    const res = await request(app)
      .patch(`/api/equipe/${professor.id}/senha`)
      .set('Authorization', `Bearer ${gerarToken(dono)}`)
      .send({ nova_senha: 'novaSenha123' });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const loginComNovaSenha = await request(app)
      .post('/api/auth/login')
      .send({ email: professor.email, senha: 'novaSenha123' });
    expect(loginComNovaSenha.status).toBe(200);

    await pool.query('DELETE FROM usuarios WHERE id = ANY($1)', [[dono.id, professor.id]]);
  });
});
