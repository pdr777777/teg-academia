const request = require('supertest');
const app = require('../server');
const pool = require('../config/db');
const { criarUsuario, criarPlano, criarMatricula, gerarToken } = require('../testUtils/fixtures');

describe('PATCH /api/pagamentos/:id/confirmar', () => {
  afterAll(async () => {
    await pool.end();
  });

  test('pagamento gerado automaticamente estende data_vencimento e reativa a matrícula suspensa', async () => {
    const admin = await criarUsuario({ role: 'dono' });
    const aluno = await criarUsuario();
    const plano = await criarPlano({ duracao_dias: 30 });
    const vencimentoAntigo = new Date(Date.now() - 10 * 86400000);
    const matricula = await criarMatricula({
      usuario_id: aluno.id, plano_id: plano.id, status: 'suspensa', data_vencimento: vencimentoAntigo,
    });
    const { rows: [pagamento] } = await pool.query(
      `INSERT INTO pagamentos (matricula_id, usuario_id, valor, status, gerado_automaticamente)
       VALUES ($1, $2, $3, 'pendente', TRUE) RETURNING *`,
      [matricula.id, aluno.id, plano.preco_mensal]
    );

    const res = await request(app)
      .patch(`/api/pagamentos/${pagamento.id}/confirmar`)
      .set('Authorization', `Bearer ${gerarToken(admin)}`)
      .send({ metodo: 'pix' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('pago');

    const { rows: [matriculaDepois] } = await pool.query('SELECT * FROM matriculas WHERE id = $1', [matricula.id]);
    expect(matriculaDepois.status).toBe('ativa');
    const esperado = new Date();
    esperado.setDate(esperado.getDate() + plano.duracao_dias);
    expect(new Date(matriculaDepois.data_vencimento).toDateString()).toBe(esperado.toDateString());

    await pool.query('DELETE FROM pagamentos WHERE id = $1', [pagamento.id]);
    await pool.query('DELETE FROM matriculas WHERE id = $1', [matricula.id]);
    await pool.query('DELETE FROM usuarios WHERE id = ANY($1)', [[admin.id, aluno.id]]);
    await pool.query('DELETE FROM planos WHERE id = $1', [plano.id]);
  });

  test('pagamento não automático continua com o comportamento atual (não mexe em data_vencimento)', async () => {
    const admin = await criarUsuario({ role: 'dono' });
    const aluno = await criarUsuario();
    const plano = await criarPlano();
    const vencimentoOriginal = new Date(Date.now() + 20 * 86400000);
    const matricula = await criarMatricula({
      usuario_id: aluno.id, plano_id: plano.id, status: 'suspensa', data_vencimento: vencimentoOriginal,
    });
    const { rows: [pagamento] } = await pool.query(
      `INSERT INTO pagamentos (matricula_id, usuario_id, valor, status)
       VALUES ($1, $2, $3, 'pendente') RETURNING *`,
      [matricula.id, aluno.id, plano.preco_mensal]
    );

    const res = await request(app)
      .patch(`/api/pagamentos/${pagamento.id}/confirmar`)
      .set('Authorization', `Bearer ${gerarToken(admin)}`)
      .send({ metodo: 'pix' });

    expect(res.status).toBe(200);

    const { rows: [matriculaDepois] } = await pool.query('SELECT * FROM matriculas WHERE id = $1', [matricula.id]);
    expect(matriculaDepois.status).toBe('ativa');
    expect(new Date(matriculaDepois.data_vencimento).toISOString()).toBe(vencimentoOriginal.toISOString());

    await pool.query('DELETE FROM pagamentos WHERE id = $1', [pagamento.id]);
    await pool.query('DELETE FROM matriculas WHERE id = $1', [matricula.id]);
    await pool.query('DELETE FROM usuarios WHERE id = ANY($1)', [[admin.id, aluno.id]]);
    await pool.query('DELETE FROM planos WHERE id = $1', [plano.id]);
  });
});
