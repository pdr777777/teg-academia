// backend/src/config/schema.test.js
const pool = require('./db');

describe('migration 022 — colunas de cobrança recorrente', () => {
  afterAll(async () => {
    await pool.end();
  });

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
