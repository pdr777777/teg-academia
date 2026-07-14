const request = require('supertest');
const app = require('../server');
const pool = require('../config/db');
const { criarUsuario, gerarToken } = require('../testUtils/fixtures');

afterAll(async () => {
  await pool.end();
});

describe('POST /api/frequencias/checkin', () => {
  test('registra check-in, dá XP e bloqueia segundo check-in no mesmo dia', async () => {
    const aluno = await criarUsuario({ role: 'aluno' });

    const primeiro = await request(app)
      .post('/api/frequencias/checkin')
      .set('Authorization', `Bearer ${gerarToken(aluno)}`);
    expect(primeiro.status).toBe(201);

    const { rows: [userAtualizado] } = await pool.query('SELECT xp FROM usuarios WHERE id = $1', [aluno.id]);
    expect(userAtualizado.xp).toBeGreaterThanOrEqual(50);

    const segundo = await request(app)
      .post('/api/frequencias/checkin')
      .set('Authorization', `Bearer ${gerarToken(aluno)}`);
    expect(segundo.status).toBe(409);

    await pool.query('DELETE FROM xp_log WHERE usuario_id = $1', [aluno.id]);
    await pool.query('DELETE FROM frequencias WHERE usuario_id = $1', [aluno.id]);
    await pool.query('DELETE FROM aluno_conquistas WHERE usuario_id = $1', [aluno.id]);
    await pool.query('DELETE FROM usuarios WHERE id = $1', [aluno.id]);
  });
});

describe('GET /api/frequencias/minha', () => {
  test('filtra por mês quando informado', async () => {
    const aluno = await criarUsuario({ role: 'aluno' });
    await pool.query('INSERT INTO frequencias (usuario_id, data) VALUES ($1, CURRENT_DATE)', [aluno.id]);

    const mesAtual = new Date().toISOString().slice(0, 7);
    const res = await request(app)
      .get(`/api/frequencias/minha?mes=${mesAtual}`)
      .set('Authorization', `Bearer ${gerarToken(aluno)}`);
    expect(res.status).toBe(200);
    expect(res.body.length).toBe(1);

    const mesPassado = await request(app)
      .get('/api/frequencias/minha?mes=2000-01')
      .set('Authorization', `Bearer ${gerarToken(aluno)}`);
    expect(mesPassado.status).toBe(200);
    expect(mesPassado.body.length).toBe(0);

    await pool.query('DELETE FROM frequencias WHERE usuario_id = $1', [aluno.id]);
    await pool.query('DELETE FROM usuarios WHERE id = $1', [aluno.id]);
  });
});

describe('GET /api/frequencias/resumo e /', () => {
  test('rejeita aluno comum', async () => {
    const aluno = await criarUsuario({ role: 'aluno' });
    const res = await request(app)
      .get('/api/frequencias/resumo')
      .set('Authorization', `Bearer ${gerarToken(aluno)}`);
    expect(res.status).toBe(403);

    await pool.query('DELETE FROM usuarios WHERE id = $1', [aluno.id]);
  });

  test('professor vê resumo com dias_ausente e treinaram_hoje', async () => {
    const professor = await criarUsuario({ role: 'professor' });
    const aluno = await criarUsuario({ role: 'aluno' });
    await pool.query('INSERT INTO frequencias (usuario_id, data) VALUES ($1, CURRENT_DATE)', [aluno.id]);

    const res = await request(app)
      .get('/api/frequencias/resumo')
      .set('Authorization', `Bearer ${gerarToken(professor)}`);
    expect(res.status).toBe(200);
    expect(res.body.treinaram_hoje).toBeGreaterThanOrEqual(1);
    const alunoNoResumo = res.body.alunos.find((a) => a.id === aluno.id);
    expect(alunoNoResumo.dias_ausente).toBe(0);

    const listaDoDia = await request(app)
      .get('/api/frequencias')
      .set('Authorization', `Bearer ${gerarToken(professor)}`);
    expect(listaDoDia.status).toBe(200);
    expect(listaDoDia.body.some((f) => f.usuario_id === aluno.id)).toBe(true);

    await pool.query('DELETE FROM frequencias WHERE usuario_id = $1', [aluno.id]);
    await pool.query('DELETE FROM usuarios WHERE id = ANY($1)', [[professor.id, aluno.id]]);
  });
});
