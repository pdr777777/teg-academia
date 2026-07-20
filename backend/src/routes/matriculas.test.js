const request = require('supertest');
const app = require('../server');
const pool = require('../config/db');
const { criarUsuario, criarPlano, criarMatricula, gerarToken } = require('../testUtils/fixtures');

jest.mock('../services/catracaService');
const catracaService = require('../services/catracaService');

afterAll(async () => {
  await pool.end();
});

describe('POST /api/matriculas', () => {
  test('rejeita sem plano_id e quando o plano não existe/está inativo', async () => {
    const aluno = await criarUsuario({ role: 'aluno' });

    const semPlano = await request(app)
      .post('/api/matriculas')
      .set('Authorization', `Bearer ${gerarToken(aluno)}`)
      .send({});
    expect(semPlano.status).toBe(400);

    const planoInativo = await criarPlano({ nome: 'Plano Inativo Matricula Teste' });
    await pool.query('UPDATE planos SET ativo = FALSE WHERE id = $1', [planoInativo.id]);

    const comPlanoInativo = await request(app)
      .post('/api/matriculas')
      .set('Authorization', `Bearer ${gerarToken(aluno)}`)
      .send({ plano_id: planoInativo.id });
    expect(comPlanoInativo.status).toBe(404);

    await pool.query('DELETE FROM planos WHERE id = $1', [planoInativo.id]);
    await pool.query('DELETE FROM usuarios WHERE id = $1', [aluno.id]);
  });

  test('cria matrícula + pagamento pendente, dá XP e converte indicação pendente', async () => {
    const indicador = await criarUsuario({ role: 'aluno' });
    const aluno = await criarUsuario({ role: 'aluno' });
    await pool.query(
      `INSERT INTO indicacoes (indicador_id, indicado_id, status) VALUES ($1, $2, 'pendente')`,
      [indicador.id, aluno.id]
    );
    const plano = await criarPlano({ nome: 'Plano Matricula Teste', duracao_dias: 30 });

    const res = await request(app)
      .post('/api/matriculas')
      .set('Authorization', `Bearer ${gerarToken(aluno)}`)
      .send({ plano_id: plano.id });

    expect(res.status).toBe(201);
    expect(res.body.usuario_id).toBe(aluno.id);

    const { rows: [pagamento] } = await pool.query(
      'SELECT * FROM pagamentos WHERE matricula_id = $1', [res.body.id]
    );
    expect(pagamento.status).toBe('pendente');
    expect(Number(pagamento.valor)).toBe(Number(plano.preco_mensal));

    const { rows: [alunoAtualizado] } = await pool.query('SELECT xp FROM usuarios WHERE id = $1', [aluno.id]);
    expect(alunoAtualizado.xp).toBeGreaterThanOrEqual(100);

    const { rows: [indicacaoAtualizada] } = await pool.query(
      'SELECT status FROM indicacoes WHERE indicador_id = $1 AND indicado_id = $2', [indicador.id, aluno.id]
    );
    expect(indicacaoAtualizada.status).toBe('convertido');

    const { rows: [indicadorAtualizado] } = await pool.query('SELECT xp FROM usuarios WHERE id = $1', [indicador.id]);
    expect(indicadorAtualizado.xp).toBeGreaterThanOrEqual(200);

    await pool.query('DELETE FROM xp_log WHERE usuario_id = ANY($1)', [[aluno.id, indicador.id]]);
    await pool.query('DELETE FROM aluno_conquistas WHERE usuario_id = ANY($1)', [[aluno.id, indicador.id]]);
    await pool.query('DELETE FROM pagamentos WHERE matricula_id = $1', [res.body.id]);
    await pool.query('DELETE FROM indicacoes WHERE indicador_id = $1', [indicador.id]);
    await pool.query('DELETE FROM matriculas WHERE id = $1', [res.body.id]);
    await pool.query('DELETE FROM planos WHERE id = $1', [plano.id]);
    await pool.query('DELETE FROM usuarios WHERE id = ANY($1)', [[aluno.id, indicador.id]]);
  });
});

describe('GET /api/matriculas/minha e /api/matriculas (admin)', () => {
  test('aluno vê só as próprias matrículas', async () => {
    const aluno = await criarUsuario({ role: 'aluno' });
    const plano = await criarPlano({ nome: 'Plano Minha Matricula Teste' });
    const matricula = await criarMatricula({ usuario_id: aluno.id, plano_id: plano.id });

    const res = await request(app)
      .get('/api/matriculas/minha')
      .set('Authorization', `Bearer ${gerarToken(aluno)}`);
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].plano_nome).toBe(plano.nome);

    await pool.query('DELETE FROM matriculas WHERE id = $1', [matricula.id]);
    await pool.query('DELETE FROM planos WHERE id = $1', [plano.id]);
    await pool.query('DELETE FROM usuarios WHERE id = $1', [aluno.id]);
  });

  test('admin lista todas as matrículas e filtra por status', async () => {
    const admin = await criarUsuario({ role: 'admin' });
    const aluno = await criarUsuario({ role: 'aluno' });
    const plano = await criarPlano({ nome: 'Plano Admin Matricula Teste' });
    const matricula = await criarMatricula({ usuario_id: aluno.id, plano_id: plano.id, status: 'ativa' });

    const semFiltro = await request(app)
      .get('/api/matriculas')
      .set('Authorization', `Bearer ${gerarToken(admin)}`);
    expect(semFiltro.status).toBe(200);
    expect(semFiltro.body.some((m) => m.id === matricula.id)).toBe(true);

    const comFiltro = await request(app)
      .get('/api/matriculas?status=cancelada')
      .set('Authorization', `Bearer ${gerarToken(admin)}`);
    expect(comFiltro.status).toBe(200);
    expect(comFiltro.body.some((m) => m.id === matricula.id)).toBe(false);

    const semAuth = await request(app).get('/api/matriculas');
    expect(semAuth.status).toBe(401);

    await pool.query('DELETE FROM matriculas WHERE id = $1', [matricula.id]);
    await pool.query('DELETE FROM planos WHERE id = $1', [plano.id]);
    await pool.query('DELETE FROM usuarios WHERE id = ANY($1)', [[admin.id, aluno.id]]);
  });
});

describe('POST /api/matriculas — integração com a catraca', () => {
  test('sincroniza e libera acesso na catraca quando a matrícula é criada', async () => {
    catracaService.sincronizarAluno.mockResolvedValue(undefined);
    catracaService.liberarAcesso.mockResolvedValue(undefined);

    const aluno = await criarUsuario({ role: 'aluno' });
    const plano = await criarPlano({ nome: 'Plano Matricula Catraca Teste' });

    const res = await request(app)
      .post('/api/matriculas')
      .set('Authorization', `Bearer ${gerarToken(aluno)}`)
      .send({ plano_id: plano.id });

    expect(res.status).toBe(201);
    expect(catracaService.sincronizarAluno).toHaveBeenCalledWith(aluno.id);
    expect(catracaService.liberarAcesso).toHaveBeenCalledWith(aluno.id);

    await pool.query('DELETE FROM pagamentos WHERE usuario_id = $1', [aluno.id]);
    await pool.query('DELETE FROM matriculas WHERE usuario_id = $1', [aluno.id]);
    await pool.query('DELETE FROM planos WHERE id = $1', [plano.id]);
    await pool.query('DELETE FROM usuarios WHERE id = $1', [aluno.id]);
  });

  test('não falha a criação da matrícula quando a catraca está offline', async () => {
    catracaService.sincronizarAluno.mockRejectedValue(new Error('Catraca catraca1 inacessível'));
    catracaService.liberarAcesso.mockResolvedValue(undefined);

    const aluno = await criarUsuario({ role: 'aluno' });
    const plano = await criarPlano({ nome: 'Plano Matricula Catraca Offline Teste' });

    const res = await request(app)
      .post('/api/matriculas')
      .set('Authorization', `Bearer ${gerarToken(aluno)}`)
      .send({ plano_id: plano.id });

    expect(res.status).toBe(201);

    await pool.query('DELETE FROM pagamentos WHERE usuario_id = $1', [aluno.id]);
    await pool.query('DELETE FROM matriculas WHERE usuario_id = $1', [aluno.id]);
    await pool.query('DELETE FROM planos WHERE id = $1', [plano.id]);
    await pool.query('DELETE FROM usuarios WHERE id = $1', [aluno.id]);
  });
});
