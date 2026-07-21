// backend/src/config/schema.test.js
const pool = require('./db');

describe('migration 022 — colunas de cobrança recorrente', () => {
  test('pagamentos tem as colunas novas', async () => {
    const { rows } = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'pagamentos' AND table_schema = current_schema()
    `);
    const colunas = rows.map((r) => r.column_name);
    expect(colunas).toEqual(expect.arrayContaining([
      'gateway', 'gateway_charge_id', 'link_pagamento', 'tentativa', 'gerado_automaticamente',
    ]));
  });

  test('configuracoes tem dias_tolerancia_bloqueio com default 5', async () => {
    const { rows: [cfg] } = await pool.query('SELECT dias_tolerancia_bloqueio FROM configuracoes WHERE id = 1');
    expect(cfg.dias_tolerancia_bloqueio).toBe(5);
  });

  test('automacoes_log aceita tipo atraso', async () => {
    await expect(pool.query(
      `INSERT INTO automacoes_log (tipo, mensagem, status) VALUES ('atraso', 'teste', 'enviado')`
    )).resolves.toBeDefined();
    await pool.query(`DELETE FROM automacoes_log WHERE tipo = 'atraso' AND mensagem = 'teste'`);
  });
});

describe('migration 029 — catraca', () => {
  afterAll(async () => {
    await pool.end();
  });

  test('tabelas da catraca existem com as colunas esperadas', async () => {
    const { rows } = await pool.query(`
      SELECT table_name, column_name FROM information_schema.columns
      WHERE table_name IN ('catraca_usuarios', 'catraca_cursor', 'catraca_eventos')
        AND table_schema = current_schema()
    `);
    const porTabela = rows.reduce((acc, r) => {
      (acc[r.table_name] ||= []).push(r.column_name);
      return acc;
    }, {});
    expect(porTabela.catraca_usuarios).toEqual(expect.arrayContaining([
      'usuario_id', 'catraca', 'catraca_user_id', 'face_status', 'grupo_ativo',
    ]));
    expect(porTabela.catraca_cursor).toEqual(expect.arrayContaining(['catraca', 'ultimo_evento_id']));
    expect(porTabela.catraca_eventos).toEqual(expect.arrayContaining(['usuario_id', 'catraca', 'tipo', 'criado_em']));
  });

  test('configuracoes tem catraca_ativa com default true', async () => {
    const { rows: [cfg] } = await pool.query('SELECT catraca_ativa FROM configuracoes WHERE id = 1');
    expect(cfg.catraca_ativa).toBe(true);
  });
});
