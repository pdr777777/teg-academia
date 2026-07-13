// backend/src/jobs/jobWorker.test.js
const pool = require('../config/db');
const { criarUsuario, criarPlano, criarMatricula } = require('../testUtils/fixtures');
const { processarVencimentos } = require('./jobWorker');

describe('processarVencimentos', () => {
  afterAll(async () => {
    await pool.end();
  });

  async function limpar(ids) {
    await pool.query('DELETE FROM pagamentos WHERE matricula_id = ANY($1)', [ids.matriculas]);
    await pool.query('DELETE FROM matriculas WHERE id = ANY($1)', [ids.matriculas]);
    await pool.query('DELETE FROM usuarios WHERE id = ANY($1)', [ids.usuarios]);
    await pool.query('DELETE FROM planos WHERE id = ANY($1)', [ids.planos]);
  }

  test('gera cobrança pendente quando a matrícula ativa vence hoje', async () => {
    const user = await criarUsuario();
    const plano = await criarPlano({ preco_mensal: 109.9, duracao_dias: 30 });
    const matricula = await criarMatricula({
      usuario_id: user.id, plano_id: plano.id, status: 'ativa', data_vencimento: new Date(),
    });

    await processarVencimentos();

    const { rows: pagamentos } = await pool.query(
      'SELECT * FROM pagamentos WHERE matricula_id = $1', [matricula.id]
    );
    expect(pagamentos).toHaveLength(1);
    expect(pagamentos[0].status).toBe('pendente');
    expect(pagamentos[0].gerado_automaticamente).toBe(true);

    const { rows: [matriculaDepois] } = await pool.query('SELECT * FROM matriculas WHERE id = $1', [matricula.id]);
    expect(matriculaDepois.status).toBe('ativa');
    expect(new Date(matriculaDepois.data_vencimento).toDateString()).toBe(new Date(matricula.data_vencimento).toDateString());

    await limpar({ usuarios: [user.id], planos: [plano.id], matriculas: [matricula.id] });
  });

  test('não duplica cobrança se rodar duas vezes no mesmo dia', async () => {
    const user = await criarUsuario();
    const plano = await criarPlano();
    const matricula = await criarMatricula({
      usuario_id: user.id, plano_id: plano.id, status: 'ativa', data_vencimento: new Date(),
    });

    await processarVencimentos();
    await processarVencimentos();

    const { rows: pagamentos } = await pool.query(
      'SELECT * FROM pagamentos WHERE matricula_id = $1', [matricula.id]
    );
    expect(pagamentos).toHaveLength(1);

    await limpar({ usuarios: [user.id], planos: [plano.id], matriculas: [matricula.id] });
  });

  test('marca vencida quando o vencimento já passou', async () => {
    const user = await criarUsuario();
    const plano = await criarPlano();
    const matricula = await criarMatricula({
      usuario_id: user.id, plano_id: plano.id, status: 'ativa',
      data_vencimento: new Date(Date.now() - 2 * 86400000),
    });

    await processarVencimentos();

    const { rows: [atualizada] } = await pool.query('SELECT status FROM matriculas WHERE id = $1', [matricula.id]);
    expect(atualizada.status).toBe('vencida');

    await limpar({ usuarios: [user.id], planos: [plano.id], matriculas: [matricula.id] });
  });

  test('marca suspensa quando o atraso passa da tolerância configurada', async () => {
    await pool.query('UPDATE configuracoes SET dias_tolerancia_bloqueio = 5 WHERE id = 1');
    const user = await criarUsuario();
    const plano = await criarPlano();
    const matricula = await criarMatricula({
      usuario_id: user.id, plano_id: plano.id, status: 'vencida',
      data_vencimento: new Date(Date.now() - 6 * 86400000),
    });

    await processarVencimentos();

    const { rows: [atualizada] } = await pool.query('SELECT status FROM matriculas WHERE id = $1', [matricula.id]);
    expect(atualizada.status).toBe('suspensa');

    await limpar({ usuarios: [user.id], planos: [plano.id], matriculas: [matricula.id] });
  });

  test('não mexe em matrícula vencida dentro do prazo de tolerância', async () => {
    await pool.query('UPDATE configuracoes SET dias_tolerancia_bloqueio = 5 WHERE id = 1');
    const user = await criarUsuario();
    const plano = await criarPlano();
    const matricula = await criarMatricula({
      usuario_id: user.id, plano_id: plano.id, status: 'vencida',
      data_vencimento: new Date(Date.now() - 2 * 86400000),
    });

    await processarVencimentos();

    const { rows: [atualizada] } = await pool.query('SELECT status FROM matriculas WHERE id = $1', [matricula.id]);
    expect(atualizada.status).toBe('vencida');

    await limpar({ usuarios: [user.id], planos: [plano.id], matriculas: [matricula.id] });
  });
});
