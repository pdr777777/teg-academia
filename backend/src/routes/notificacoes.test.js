const request = require('supertest');
const app = require('../server');
const pool = require('../config/db');
const { criarUsuario, criarTreino, atribuirTreino } = require('../testUtils/fixtures');

afterAll(async () => {
  await pool.end();
});

async function limparSessao(usuarioId, treinoId) {
  await pool.query(
    `DELETE FROM treino_sessao_series WHERE sessao_id IN (SELECT id FROM treino_sessoes WHERE usuario_id = $1)`,
    [usuarioId]
  );
  await pool.query('DELETE FROM treino_sessoes WHERE usuario_id = $1', [usuarioId]);
  await pool.query('DELETE FROM xp_log WHERE usuario_id = $1', [usuarioId]);
  await pool.query('DELETE FROM frequencias WHERE usuario_id = $1', [usuarioId]);
  if (treinoId) {
    await pool.query('DELETE FROM treino_alunos WHERE treino_id = $1', [treinoId]);
    await pool.query('DELETE FROM treinos WHERE id = $1', [treinoId]);
  }
  await pool.query('DELETE FROM usuarios WHERE id = $1', [usuarioId]);
}

describe('POST /api/notifications/catraca/:secret/:eventType', () => {
  const originalSecret = process.env.CATRACA_WEBHOOK_SECRET;
  const SECRET = 'segredo-catraca-teste';
  beforeAll(() => { process.env.CATRACA_WEBHOOK_SECRET = SECRET; });
  afterAll(() => { process.env.CATRACA_WEBHOOK_SECRET = originalSecret; });

  test('rejeita sem o segredo correto', async () => {
    const res = await request(app)
      .post('/api/notifications/catraca/segredo-errado/catra_event')
      .send({ user_id: 1 });
    expect(res.status).toBe(401);
  });

  test('ignora eventos que não são catra_event', async () => {
    const res = await request(app)
      .post(`/api/notifications/catraca/${SECRET}/operation_mode`)
      .send({ user_id: 1 });
    expect(res.status).toBe(200);
    expect(res.body.ignorado).toBe(true);
  });

  test('responde ok quando o payload não tem user_id reconhecível', async () => {
    const res = await request(app)
      .post(`/api/notifications/catraca/${SECRET}/catra_event`)
      .send({ algum_campo: 'sem id' });
    expect(res.status).toBe(200);
    expect(res.body.aviso).toMatch(/user_id/);
  });

  test('responde ok quando o user_id não está mapeado a nenhum aluno', async () => {
    const res = await request(app)
      .post(`/api/notifications/catraca/${SECRET}/catra_event`)
      .send({ user_id: 'inexistente-999' });
    expect(res.status).toBe(200);
    expect(res.body.aviso).toMatch(/não mapeado/);
  });

  test('inicia sessão de treino quando o user_id do Control iD está mapeado ao aluno', async () => {
    const aluno = await criarUsuario({ role: 'aluno' });
    await pool.query('UPDATE usuarios SET controlid_user_id = $1 WHERE id = $2', ['42', aluno.id]);
    const treino = await criarTreino({ nome: 'Treino Catraca ControlId Teste' });
    await atribuirTreino(treino.id, aluno.id);

    const res = await request(app)
      .post(`/api/notifications/catraca/${SECRET}/catra_event`)
      .send({ user_id: 42 });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const { rows: [sessao] } = await pool.query(
      `SELECT * FROM treino_sessoes WHERE usuario_id = $1 AND status = 'em_andamento'`,
      [aluno.id]
    );
    expect(sessao).toBeDefined();
    expect(sessao.origem).toBe('catraca');

    await limparSessao(aluno.id, treino.id);
  });

  test('registra frequência mesmo quando o aluno não tem treino atribuído', async () => {
    const aluno = await criarUsuario({ role: 'aluno' });
    await pool.query('UPDATE usuarios SET controlid_user_id = $1 WHERE id = $2', ['43', aluno.id]);

    const res = await request(app)
      .post(`/api/notifications/catraca/${SECRET}/catra_event`)
      .send({ user_id: 43 });
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    const { rows: [freq] } = await pool.query(
      `SELECT * FROM frequencias WHERE usuario_id = $1 AND data = CURRENT_DATE`,
      [aluno.id]
    );
    expect(freq).toBeDefined();

    await limparSessao(aluno.id);
  });

  test('não duplica frequência se o aluno já fez check-in hoje', async () => {
    const aluno = await criarUsuario({ role: 'aluno' });
    await pool.query('UPDATE usuarios SET controlid_user_id = $1 WHERE id = $2', ['44', aluno.id]);
    await pool.query(`INSERT INTO frequencias (usuario_id, data) VALUES ($1, CURRENT_DATE)`, [aluno.id]);

    const res = await request(app)
      .post(`/api/notifications/catraca/${SECRET}/catra_event`)
      .send({ user_id: 44 });
    expect(res.status).toBe(200);

    const { rows } = await pool.query(
      `SELECT * FROM frequencias WHERE usuario_id = $1 AND data = CURRENT_DATE`,
      [aluno.id]
    );
    expect(rows).toHaveLength(1);

    await limparSessao(aluno.id);
  });
});
