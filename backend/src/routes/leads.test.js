const request = require('supertest');
const app = require('../server');
const pool = require('../config/db');
const { criarUsuario, gerarToken } = require('../testUtils/fixtures');

afterAll(async () => {
  await pool.end();
});

describe('POST /api/leads (público)', () => {
  test('rejeita sem nome ou telefone', async () => {
    const res = await request(app).post('/api/leads').send({ nome: 'Sem Telefone' });
    expect(res.status).toBe(400);
  });

  test('cria lead simples sem indicador', async () => {
    const res = await request(app).post('/api/leads').send({
      nome: 'Lead Direto Teste',
      telefone: '67911112222',
    });
    expect(res.status).toBe(201);
    expect(res.body.lead_id).toBeDefined();

    await pool.query('DELETE FROM pipeline_historico WHERE lead_id = $1', [res.body.lead_id]);
    await pool.query('DELETE FROM leads WHERE id = $1', [res.body.lead_id]);
  });

  test('cria lead via link de indicação, origem vira "indicacao" e cria registro em indicacoes', async () => {
    const indicador = await criarUsuario({ role: 'aluno' });

    const res = await request(app).post('/api/leads').send({
      nome: 'Lead Indicado Teste',
      telefone: '67933334444',
      ref: indicador.link_indicacao,
    });
    expect(res.status).toBe(201);

    const { rows: [lead] } = await pool.query('SELECT * FROM leads WHERE id = $1', [res.body.lead_id]);
    expect(lead.origem).toBe('indicacao');
    expect(lead.indicador_id).toBe(indicador.id);

    const { rows: indicacoes } = await pool.query(
      'SELECT * FROM indicacoes WHERE indicador_id = $1 AND lead_id = $2',
      [indicador.id, lead.id]
    );
    expect(indicacoes).toHaveLength(1);

    await pool.query('DELETE FROM indicacoes WHERE lead_id = $1', [lead.id]);
    await pool.query('DELETE FROM pipeline_historico WHERE lead_id = $1', [lead.id]);
    await pool.query('DELETE FROM leads WHERE id = $1', [lead.id]);
    await pool.query('DELETE FROM usuarios WHERE id = $1', [indicador.id]);
  });
});

describe('GET /api/leads (admin)', () => {
  test('rejeita sem role admin/dono', async () => {
    const aluno = await criarUsuario({ role: 'aluno' });
    const res = await request(app)
      .get('/api/leads')
      .set('Authorization', `Bearer ${gerarToken(aluno)}`);
    expect(res.status).toBe(403);

    await pool.query('DELETE FROM usuarios WHERE id = $1', [aluno.id]);
  });

  test('filtra por status e busca', async () => {
    const admin = await criarUsuario({ role: 'admin' });
    const { rows: [lead] } = await pool.query(
      `INSERT INTO leads (nome, telefone, status_pipeline) VALUES ('Lead Buscavel Teste', '67955556666', 'contato') RETURNING *`
    );

    const porStatus = await request(app)
      .get('/api/leads?status=contato')
      .set('Authorization', `Bearer ${gerarToken(admin)}`);
    expect(porStatus.status).toBe(200);
    expect(porStatus.body.some((l) => l.id === lead.id)).toBe(true);

    const porBusca = await request(app)
      .get('/api/leads?busca=Buscavel')
      .set('Authorization', `Bearer ${gerarToken(admin)}`);
    expect(porBusca.status).toBe(200);
    expect(porBusca.body.some((l) => l.id === lead.id)).toBe(true);

    await pool.query('DELETE FROM leads WHERE id = $1', [lead.id]);
    await pool.query('DELETE FROM usuarios WHERE id = $1', [admin.id]);
  });
});

describe('PATCH /api/leads/:id/pipeline', () => {
  test('rejeita status inválido e move o lead registrando histórico', async () => {
    const admin = await criarUsuario({ role: 'admin' });
    const { rows: [lead] } = await pool.query(
      `INSERT INTO leads (nome, telefone) VALUES ('Lead Pipeline Teste', '67977778888') RETURNING *`
    );

    const statusInvalido = await request(app)
      .patch(`/api/leads/${lead.id}/pipeline`)
      .set('Authorization', `Bearer ${gerarToken(admin)}`)
      .send({ status_novo: 'nao-existe' });
    expect(statusInvalido.status).toBe(400);

    const mudancaValida = await request(app)
      .patch(`/api/leads/${lead.id}/pipeline`)
      .set('Authorization', `Bearer ${gerarToken(admin)}`)
      .send({ status_novo: 'contato', observacao: 'Primeiro contato feito' });
    expect(mudancaValida.status).toBe(200);
    expect(mudancaValida.body.status_pipeline).toBe('contato');

    const { rows: historico } = await pool.query(
      'SELECT * FROM pipeline_historico WHERE lead_id = $1 ORDER BY created_at DESC LIMIT 1',
      [lead.id]
    );
    expect(historico[0].status_anterior).toBe('novo_lead');
    expect(historico[0].status_novo).toBe('contato');

    const inexistente = await request(app)
      .patch('/api/leads/999999999/pipeline')
      .set('Authorization', `Bearer ${gerarToken(admin)}`)
      .send({ status_novo: 'contato' });
    expect(inexistente.status).toBe(404);

    await pool.query('DELETE FROM pipeline_historico WHERE lead_id = $1', [lead.id]);
    await pool.query('DELETE FROM leads WHERE id = $1', [lead.id]);
    await pool.query('DELETE FROM usuarios WHERE id = $1', [admin.id]);
  });
});
