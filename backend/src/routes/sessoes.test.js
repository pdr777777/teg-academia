const request = require('supertest');
const app = require('../server');
const pool = require('../config/db');
const {
  criarUsuario, criarExercicio, criarTreino, criarTreinoExercicio, atribuirTreino, gerarToken,
} = require('../testUtils/fixtures');

afterAll(async () => {
  await pool.end();
});

async function limparSessao(usuarioId, treinoId, exercicioId) {
  await pool.query(
    `DELETE FROM treino_sessao_series WHERE sessao_id IN (SELECT id FROM treino_sessoes WHERE usuario_id = $1)`,
    [usuarioId]
  );
  await pool.query('DELETE FROM treino_sessoes WHERE usuario_id = $1', [usuarioId]);
  await pool.query('DELETE FROM xp_log WHERE usuario_id = $1', [usuarioId]);
  await pool.query('DELETE FROM aluno_conquistas WHERE usuario_id = $1', [usuarioId]);
  await pool.query('DELETE FROM frequencias WHERE usuario_id = $1', [usuarioId]);
  if (treinoId) {
    await pool.query('DELETE FROM treino_alunos WHERE treino_id = $1', [treinoId]);
    await pool.query('DELETE FROM treino_exercicios WHERE treino_id = $1', [treinoId]);
    await pool.query('DELETE FROM treinos WHERE id = $1', [treinoId]);
  }
  if (exercicioId) await pool.query('DELETE FROM exercicios WHERE id = $1', [exercicioId]);
  await pool.query('DELETE FROM usuarios WHERE id = $1', [usuarioId]);
}

describe('POST /api/sessoes/iniciar', () => {
  test('rejeita aluno sem treino atribuído', async () => {
    const aluno = await criarUsuario({ role: 'aluno' });
    const res = await request(app)
      .post('/api/sessoes/iniciar')
      .set('Authorization', `Bearer ${gerarToken(aluno)}`);
    expect(res.status).toBe(400);

    await limparSessao(aluno.id);
  });

  test('inicia sessão e retorna a mesma sessão em andamento se chamado de novo', async () => {
    const aluno = await criarUsuario({ role: 'aluno' });
    const treino = await criarTreino({ nome: 'Treino Sessao Teste' });
    await atribuirTreino(treino.id, aluno.id);

    const primeira = await request(app)
      .post('/api/sessoes/iniciar')
      .set('Authorization', `Bearer ${gerarToken(aluno)}`);
    expect(primeira.status).toBe(201);
    expect(primeira.body.status).toBe('em_andamento');

    const segunda = await request(app)
      .post('/api/sessoes/iniciar')
      .set('Authorization', `Bearer ${gerarToken(aluno)}`);
    expect(segunda.status).toBe(201);
    expect(segunda.body.id).toBe(primeira.body.id);

    await limparSessao(aluno.id, treino.id);
  });
});

describe('GET /api/sessoes/atual', () => {
  test('retorna null quando não há sessão em andamento', async () => {
    const aluno = await criarUsuario({ role: 'aluno' });
    const res = await request(app)
      .get('/api/sessoes/atual')
      .set('Authorization', `Bearer ${gerarToken(aluno)}`);
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();

    await limparSessao(aluno.id);
  });
});

describe('POST /api/sessoes/:id/serie', () => {
  test('rejeita série de exercício que não pertence ao treino da sessão', async () => {
    const aluno = await criarUsuario({ role: 'aluno' });
    const treino = await criarTreino({ nome: 'Treino Serie Teste' });
    const exercicioDeOutroTreino = await criarExercicio({ nome: 'Exercicio Alheio Teste' });
    await atribuirTreino(treino.id, aluno.id);

    const sessao = await request(app)
      .post('/api/sessoes/iniciar')
      .set('Authorization', `Bearer ${gerarToken(aluno)}`);

    const res = await request(app)
      .post(`/api/sessoes/${sessao.body.id}/serie`)
      .set('Authorization', `Bearer ${gerarToken(aluno)}`)
      .send({ treino_exercicio_id: 999999999, numero_serie: 1, repeticoes_realizadas: 10 });
    expect(res.status).toBe(400);

    const sessaoInexistente = await request(app)
      .post('/api/sessoes/999999999/serie')
      .set('Authorization', `Bearer ${gerarToken(aluno)}`)
      .send({ treino_exercicio_id: 1, numero_serie: 1 });
    expect(sessaoInexistente.status).toBe(404);

    await pool.query('DELETE FROM exercicios WHERE id = $1', [exercicioDeOutroTreino.id]);
    await limparSessao(aluno.id, treino.id);
  });

  test('registra série de um exercício que pertence ao treino da sessão', async () => {
    const aluno = await criarUsuario({ role: 'aluno' });
    const treino = await criarTreino({ nome: 'Treino Serie Valida Teste' });
    const exercicio = await criarExercicio({ nome: 'Rosca Direta Teste' });
    const treinoExercicio = await criarTreinoExercicio({ treino_id: treino.id, exercicio_id: exercicio.id });
    await atribuirTreino(treino.id, aluno.id);

    const sessao = await request(app)
      .post('/api/sessoes/iniciar')
      .set('Authorization', `Bearer ${gerarToken(aluno)}`);

    const res = await request(app)
      .post(`/api/sessoes/${sessao.body.id}/serie`)
      .set('Authorization', `Bearer ${gerarToken(aluno)}`)
      .send({ treino_exercicio_id: treinoExercicio.id, numero_serie: 1, repeticoes_realizadas: 12, carga_realizada: 20 });
    expect(res.status).toBe(201);
    expect(res.body.sessao_id).toBe(sessao.body.id);

    await limparSessao(aluno.id, treino.id, exercicio.id);
  });
});

describe('PATCH /api/sessoes/:id/finalizar', () => {
  test('finaliza a sessão, faz check-in do dia e dá XP de treino + bônus por série', async () => {
    const aluno = await criarUsuario({ role: 'aluno' });
    const treino = await criarTreino({ nome: 'Treino Finalizar Teste' });
    const exercicio = await criarExercicio({ nome: 'Leg Press Teste' });
    const treinoExercicio = await criarTreinoExercicio({ treino_id: treino.id, exercicio_id: exercicio.id });
    await atribuirTreino(treino.id, aluno.id);

    const sessao = await request(app)
      .post('/api/sessoes/iniciar')
      .set('Authorization', `Bearer ${gerarToken(aluno)}`);

    await request(app)
      .post(`/api/sessoes/${sessao.body.id}/serie`)
      .set('Authorization', `Bearer ${gerarToken(aluno)}`)
      .send({ treino_exercicio_id: treinoExercicio.id, numero_serie: 1, repeticoes_realizadas: 12 });

    const res = await request(app)
      .patch(`/api/sessoes/${sessao.body.id}/finalizar`)
      .set('Authorization', `Bearer ${gerarToken(aluno)}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('finalizada');
    expect(res.body.series_registradas).toBe(1);
    expect(res.body.xp_ganho).toBe(50 + 2); // XP de treino (check-in) + bônus por 1 série registrada

    const { rows: [freq] } = await pool.query(
      'SELECT * FROM frequencias WHERE usuario_id = $1', [aluno.id]
    );
    expect(freq).toBeDefined();

    const finalizarDeNovo = await request(app)
      .patch(`/api/sessoes/${sessao.body.id}/finalizar`)
      .set('Authorization', `Bearer ${gerarToken(aluno)}`);
    expect(finalizarDeNovo.status).toBe(404);

    await limparSessao(aluno.id, treino.id, exercicio.id);
  });
});

describe('POST /api/sessoes/catraca-checkin', () => {
  const originalSecret = process.env.CATRACA_WEBHOOK_SECRET;
  beforeAll(() => { process.env.CATRACA_WEBHOOK_SECRET = 'segredo-catraca-teste'; });
  afterAll(() => { process.env.CATRACA_WEBHOOK_SECRET = originalSecret; });

  test('rejeita sem o segredo correto', async () => {
    const res = await request(app)
      .post('/api/sessoes/catraca-checkin')
      .send({ usuario_id: 1 });
    expect(res.status).toBe(401);
  });

  test('inicia sessão por CPF quando o segredo é válido', async () => {
    const aluno = await criarUsuario({ role: 'aluno' });
    await pool.query('UPDATE usuarios SET cpf = $1 WHERE id = $2', ['12345678900', aluno.id]);
    const treino = await criarTreino({ nome: 'Treino Catraca Teste' });
    await atribuirTreino(treino.id, aluno.id);

    const res = await request(app)
      .post('/api/sessoes/catraca-checkin')
      .set('x-catraca-secret', 'segredo-catraca-teste')
      .send({ cpf: '12345678900' });
    expect(res.status).toBe(201);
    expect(res.body.origem).toBe('catraca');

    const naoIdentificado = await request(app)
      .post('/api/sessoes/catraca-checkin')
      .set('x-catraca-secret', 'segredo-catraca-teste')
      .send({ cpf: '00000000000' });
    expect(naoIdentificado.status).toBe(404);

    await limparSessao(aluno.id, treino.id);
  });
});
