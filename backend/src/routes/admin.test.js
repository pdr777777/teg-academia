const request = require('supertest');
const app = require('../server');
const pool = require('../config/db');
const { criarUsuario, criarPlano, criarMatricula, gerarToken } = require('../testUtils/fixtures');

afterAll(async () => {
  await pool.end();
});

describe('GET /api/admin/financeiro — inadimplentes', () => {
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

jest.mock('../services/catracaService');
const catracaService = require('../services/catracaService');

describe('POST /api/admin/matriculas — integração com a catraca', () => {
  beforeEach(() => {
    catracaService.sincronizarAluno.mockReset();
    catracaService.liberarAcesso.mockReset();
  });

  test('sincroniza e libera acesso quando o admin cria a matrícula já ativa (com pagamento)', async () => {
    catracaService.sincronizarAluno.mockResolvedValue(undefined);
    catracaService.liberarAcesso.mockResolvedValue(undefined);

    const admin = await criarUsuario({ role: 'admin' });
    const aluno = await criarUsuario({ role: 'aluno' });
    const plano = await criarPlano({ nome: 'Plano Admin Matricula Catraca Teste' });

    const res = await request(app)
      .post('/api/admin/matriculas')
      .set('Authorization', `Bearer ${gerarToken(admin)}`)
      .send({ usuario_id: aluno.id, plano_id: plano.id, metodo_pagamento: 'pix' });

    expect(res.status).toBe(201);
    expect(catracaService.sincronizarAluno).toHaveBeenCalledWith(aluno.id);
    expect(catracaService.liberarAcesso).toHaveBeenCalledWith(aluno.id);

    await pool.query('DELETE FROM pagamentos WHERE matricula_id = $1', [res.body.id]);
    await pool.query('DELETE FROM matriculas WHERE id = $1', [res.body.id]);
    await pool.query('DELETE FROM planos WHERE id = $1', [plano.id]);
    await pool.query('DELETE FROM usuarios WHERE id = ANY($1)', [[admin.id, aluno.id]]);
  });

  test('não sincroniza com a catraca quando a matrícula fica pendente (sem método de pagamento)', async () => {
    const admin = await criarUsuario({ role: 'admin' });
    const aluno = await criarUsuario({ role: 'aluno' });
    const plano = await criarPlano({ nome: 'Plano Admin Matricula Pendente Teste' });

    const res = await request(app)
      .post('/api/admin/matriculas')
      .set('Authorization', `Bearer ${gerarToken(admin)}`)
      .send({ usuario_id: aluno.id, plano_id: plano.id });

    expect(res.status).toBe(201);
    expect(catracaService.sincronizarAluno).not.toHaveBeenCalled();

    await pool.query('DELETE FROM pagamentos WHERE matricula_id = $1', [res.body.id]);
    await pool.query('DELETE FROM matriculas WHERE id = $1', [res.body.id]);
    await pool.query('DELETE FROM planos WHERE id = $1', [plano.id]);
    await pool.query('DELETE FROM usuarios WHERE id = ANY($1)', [[admin.id, aluno.id]]);
  });

  test('não falha a criação da matrícula quando a catraca está offline', async () => {
    catracaService.sincronizarAluno.mockRejectedValue(new Error('Catraca catraca1 inacessível'));
    catracaService.liberarAcesso.mockResolvedValue(undefined);

    const admin = await criarUsuario({ role: 'admin' });
    const aluno = await criarUsuario({ role: 'aluno' });
    const plano = await criarPlano({ nome: 'Plano Admin Matricula Catraca Offline Teste' });

    const res = await request(app)
      .post('/api/admin/matriculas')
      .set('Authorization', `Bearer ${gerarToken(admin)}`)
      .send({ usuario_id: aluno.id, plano_id: plano.id, metodo_pagamento: 'dinheiro' });

    expect(res.status).toBe(201);

    await pool.query('DELETE FROM pagamentos WHERE matricula_id = $1', [res.body.id]);
    await pool.query('DELETE FROM matriculas WHERE id = $1', [res.body.id]);
    await pool.query('DELETE FROM planos WHERE id = $1', [plano.id]);
    await pool.query('DELETE FROM usuarios WHERE id = ANY($1)', [[admin.id, aluno.id]]);
  });
});

describe('PATCH /api/admin/alunos/:id/toggle — integração com a catraca', () => {
  beforeEach(() => {
    catracaService.liberarAcesso.mockReset();
    catracaService.bloquearAcesso.mockReset();
  });

  test('libera acesso na catraca quando a chavinha liga (ativo: false -> true)', async () => {
    catracaService.liberarAcesso.mockResolvedValue(undefined);
    const admin = await criarUsuario({ role: 'admin' });
    const aluno = await criarUsuario({ role: 'aluno' });
    await pool.query('UPDATE usuarios SET ativo = FALSE WHERE id = $1', [aluno.id]);

    const res = await request(app)
      .patch(`/api/admin/alunos/${aluno.id}/toggle`)
      .set('Authorization', `Bearer ${gerarToken(admin)}`);

    expect(res.status).toBe(200);
    expect(res.body.ativo).toBe(true);
    expect(catracaService.liberarAcesso).toHaveBeenCalledWith(aluno.id);
    expect(catracaService.bloquearAcesso).not.toHaveBeenCalled();

    await pool.query('DELETE FROM usuarios WHERE id = ANY($1)', [[admin.id, aluno.id]]);
  });

  test('bloqueia acesso na catraca quando a chavinha desliga (ativo: true -> false)', async () => {
    catracaService.bloquearAcesso.mockResolvedValue(undefined);
    const admin = await criarUsuario({ role: 'admin' });
    const aluno = await criarUsuario({ role: 'aluno' });

    const res = await request(app)
      .patch(`/api/admin/alunos/${aluno.id}/toggle`)
      .set('Authorization', `Bearer ${gerarToken(admin)}`);

    expect(res.status).toBe(200);
    expect(res.body.ativo).toBe(false);
    expect(catracaService.bloquearAcesso).toHaveBeenCalledWith(aluno.id);
    expect(catracaService.liberarAcesso).not.toHaveBeenCalled();

    await pool.query('DELETE FROM usuarios WHERE id = ANY($1)', [[admin.id, aluno.id]]);
  });

  test('não falha o toggle quando a catraca está offline', async () => {
    catracaService.bloquearAcesso.mockRejectedValue(new Error('Catraca catraca1 inacessível'));
    const admin = await criarUsuario({ role: 'admin' });
    const aluno = await criarUsuario({ role: 'aluno' });

    const res = await request(app)
      .patch(`/api/admin/alunos/${aluno.id}/toggle`)
      .set('Authorization', `Bearer ${gerarToken(admin)}`);

    expect(res.status).toBe(200);

    await pool.query('DELETE FROM usuarios WHERE id = ANY($1)', [[admin.id, aluno.id]]);
  });
});

describe('GET /api/admin/alunos/:id — detalhe', () => {
  test('retorna dados completos, plano ativo e ultima mensalidade paga', async () => {
    const admin = await criarUsuario({ role: 'admin' });
    const aluno = await criarUsuario({ nome: 'Aluno Detalhe', role: 'aluno' });
    await pool.query(
      `UPDATE usuarios SET cpf = $1, apelido = $2, telefone = $3 WHERE id = $4`,
      ['11122233344', 'Alunão', '67988887777', aluno.id]
    );
    const plano = await criarPlano({ nome: 'Plano Detalhe Teste' });
    const matricula = await criarMatricula({ usuario_id: aluno.id, plano_id: plano.id, status: 'ativa' });
    const pagamentoAntigo = new Date(Date.now() - 40 * 86400000);
    const pagamentoRecente = new Date(Date.now() - 2 * 86400000);
    await pool.query(
      `INSERT INTO pagamentos (matricula_id, usuario_id, valor, status, data_pagamento) VALUES ($1, $2, 100, 'pago', $3)`,
      [matricula.id, aluno.id, pagamentoAntigo]
    );
    await pool.query(
      `INSERT INTO pagamentos (matricula_id, usuario_id, valor, status, data_pagamento) VALUES ($1, $2, 100, 'pago', $3)`,
      [matricula.id, aluno.id, pagamentoRecente]
    );

    const res = await request(app)
      .get(`/api/admin/alunos/${aluno.id}`)
      .set('Authorization', `Bearer ${gerarToken(admin)}`);

    expect(res.status).toBe(200);
    expect(res.body.nome).toBe('Aluno Detalhe');
    expect(res.body.cpf).toBe('11122233344');
    expect(res.body.apelido).toBe('Alunão');
    expect(res.body.plano_nome).toBe('Plano Detalhe Teste');
    expect(res.body.matricula_status).toBe('ativa');
    expect(new Date(res.body.ultima_mensalidade).toDateString()).toBe(pagamentoRecente.toDateString());

    await pool.query('DELETE FROM pagamentos WHERE matricula_id = $1', [matricula.id]);
    await pool.query('DELETE FROM matriculas WHERE id = $1', [matricula.id]);
    await pool.query('DELETE FROM planos WHERE id = $1', [plano.id]);
    await pool.query('DELETE FROM usuarios WHERE id = ANY($1)', [[admin.id, aluno.id]]);
  });

  test('404 quando o aluno não existe', async () => {
    const admin = await criarUsuario({ role: 'admin' });
    const res = await request(app)
      .get('/api/admin/alunos/999999999')
      .set('Authorization', `Bearer ${gerarToken(admin)}`);
    expect(res.status).toBe(404);
    await pool.query('DELETE FROM usuarios WHERE id = $1', [admin.id]);
  });

  test('rejeita aluno comum', async () => {
    const aluno = await criarUsuario({ role: 'aluno' });
    const res = await request(app)
      .get(`/api/admin/alunos/${aluno.id}`)
      .set('Authorization', `Bearer ${gerarToken(aluno)}`);
    expect(res.status).toBe(403);
    await pool.query('DELETE FROM usuarios WHERE id = $1', [aluno.id]);
  });
});

describe('GET /api/admin/alunos/:id/frequencia', () => {
  test('retorna 30 dias, marcando os dias com check-in como foi: true', async () => {
    const admin = await criarUsuario({ role: 'admin' });
    const aluno = await criarUsuario({ role: 'aluno' });
    const hoje = new Date().toISOString().slice(0, 10);
    const ontem = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    await pool.query(`INSERT INTO frequencias (usuario_id, data) VALUES ($1, $2), ($1, $3)`, [aluno.id, hoje, ontem]);

    const res = await request(app)
      .get(`/api/admin/alunos/${aluno.id}/frequencia`)
      .set('Authorization', `Bearer ${gerarToken(admin)}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(30);
    expect(res.body[res.body.length - 1].data.slice(0, 10)).toBe(hoje);
    expect(res.body[res.body.length - 1].foi).toBe(true);
    expect(res.body[res.body.length - 2].foi).toBe(true);
    expect(res.body[0].foi).toBe(false);

    await pool.query('DELETE FROM frequencias WHERE usuario_id = $1', [aluno.id]);
    await pool.query('DELETE FROM usuarios WHERE id = ANY($1)', [[admin.id, aluno.id]]);
  });
});
