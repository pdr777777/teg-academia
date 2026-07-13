// backend/src/jobs/jobWorker.test.js
jest.mock('../services/gateway', () => {
  const actual = jest.requireActual('../services/gateway');
  return { ...actual, getGatewayAdapter: jest.fn(actual.getGatewayAdapter) };
});

const pool = require('../config/db');
const { criarUsuario, criarPlano, criarMatricula } = require('../testUtils/fixtures');
const { getGatewayAdapter } = require('../services/gateway');
const { processarVencimentos } = require('./jobWorker');
const { agendarAutomacoes, processarJob } = require('./jobWorker');

describe('processarVencimentos', () => {
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

  test('isola falha do gateway numa matrícula sem travar as demais nem as transições de status', async () => {
    const userFalha = await criarUsuario();
    const userOk = await criarUsuario();
    const userVencida = await criarUsuario();
    const plano = await criarPlano();

    const matriculaFalha = await criarMatricula({
      usuario_id: userFalha.id, plano_id: plano.id, status: 'ativa', data_vencimento: new Date(),
    });
    const matriculaOk = await criarMatricula({
      usuario_id: userOk.id, plano_id: plano.id, status: 'ativa', data_vencimento: new Date(),
    });
    const matriculaVencida = await criarMatricula({
      usuario_id: userVencida.id, plano_id: plano.id, status: 'ativa',
      data_vencimento: new Date(Date.now() - 2 * 86400000),
    });

    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    getGatewayAdapter.mockImplementationOnce(() => ({
      suportaWebhook: false,
      async criarCobranca({ usuario }) {
        if (usuario.id === userFalha.id) {
          throw new Error('gateway indisponível (simulado)');
        }
        return { gateway_charge_id: 'charge-teste', link_pagamento: 'http://teste/pagar' };
      },
      async processarWebhook() {
        throw new Error('não usado neste teste');
      },
    }));

    await expect(processarVencimentos()).resolves.not.toThrow();

    const { rows: pagamentosFalha } = await pool.query(
      'SELECT * FROM pagamentos WHERE matricula_id = $1', [matriculaFalha.id]
    );
    expect(pagamentosFalha).toHaveLength(0);

    const { rows: pagamentosOk } = await pool.query(
      'SELECT * FROM pagamentos WHERE matricula_id = $1', [matriculaOk.id]
    );
    expect(pagamentosOk).toHaveLength(1);
    expect(pagamentosOk[0].status).toBe('pendente');

    const { rows: [vencidaDepois] } = await pool.query(
      'SELECT status FROM matriculas WHERE id = $1', [matriculaVencida.id]
    );
    expect(vencidaDepois.status).toBe('vencida');

    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining(String(matriculaFalha.id)),
      expect.any(String)
    );
    consoleErrorSpy.mockRestore();

    await limpar({
      usuarios: [userFalha.id, userOk.id, userVencida.id],
      planos: [plano.id],
      matriculas: [matriculaFalha.id, matriculaOk.id, matriculaVencida.id],
    });
  });
});

describe('processarJob — novos tipos', () => {
  test('whatsapp_cobranca_gerada não lança erro', async () => {
    await expect(processarJob({
      tipo: 'whatsapp_cobranca_gerada',
      payload: { telefone: '67999999999', nome: 'Maria', link_pagamento: 'https://pay.example.com/x' },
    })).resolves.not.toThrow();
  });

  test('whatsapp_atraso não lança erro', async () => {
    await expect(processarJob({
      tipo: 'whatsapp_atraso',
      payload: { telefone: '67999999999', nome: 'Maria', dias_atraso: 3 },
    })).resolves.not.toThrow();
  });
});

describe('agendarAutomacoes — lembrete de atraso', () => {
  afterAll(async () => {
    await pool.end();
  });

  test('agenda job whatsapp_atraso pra matrícula vencida e não duplica no mesmo dia', async () => {
    const user = await criarUsuario();
    const plano = await criarPlano();
    const matricula = await criarMatricula({
      usuario_id: user.id, plano_id: plano.id, status: 'vencida',
      data_vencimento: new Date(Date.now() - 1 * 86400000),
    });

    await pool.query(`DELETE FROM jobs WHERE tipo = 'whatsapp_atraso'`);
    await pool.query(`DELETE FROM automacoes_log WHERE usuario_id = $1 AND tipo = 'atraso'`, [user.id]);

    await agendarAutomacoes();
    await agendarAutomacoes();

    const { rows: jobs } = await pool.query(
      `SELECT * FROM jobs WHERE tipo = 'whatsapp_atraso' AND payload->>'telefone' = $1`,
      [user.telefone]
    );
    expect(jobs).toHaveLength(1);

    await pool.query('DELETE FROM jobs WHERE id = ANY($1)', [jobs.map((j) => j.id)]);
    await pool.query(`DELETE FROM automacoes_log WHERE usuario_id = $1`, [user.id]);
    await pool.query('DELETE FROM matriculas WHERE id = $1', [matricula.id]);
    await pool.query('DELETE FROM usuarios WHERE id = $1', [user.id]);
    await pool.query('DELETE FROM planos WHERE id = $1', [plano.id]);
  });
});
