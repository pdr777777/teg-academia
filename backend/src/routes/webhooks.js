const express = require('express');
const pool = require('../config/db');
const { getGatewayAdapter } = require('../services/gateway');

const router = express.Router();

// POST /api/webhooks/pagamento — recebido do gateway configurado via PAYMENT_GATEWAY.
// Inerte (404) enquanto o gateway ativo for o manual.
router.post('/pagamento', async (req, res, next) => {
  try {
    const adapter = getGatewayAdapter();
    if (!adapter.suportaWebhook) {
      return res.status(404).json({ error: 'Gateway atual não recebe webhook' });
    }

    const { gateway_charge_id, status } = await adapter.processarWebhook(req.body);

    const { rows: [pagamento] } = await pool.query(
      `UPDATE pagamentos SET status = $1, data_pagamento = CASE WHEN $1 = 'pago' THEN NOW() ELSE data_pagamento END
       WHERE gateway_charge_id = $2 RETURNING *`,
      [status, gateway_charge_id]
    );
    if (!pagamento) return res.status(404).json({ error: 'Cobrança não encontrada' });

    if (status === 'pago') {
      await pool.query(
        `UPDATE matriculas SET status = 'ativa', updated_at = NOW() WHERE id = $1`,
        [pagamento.matricula_id]
      );
    }

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
