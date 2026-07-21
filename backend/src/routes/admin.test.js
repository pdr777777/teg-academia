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
