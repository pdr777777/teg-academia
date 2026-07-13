// backend/src/services/gateway/gatewayAdapter.js
// Contrato que qualquer adapter de gateway de pagamento precisa implementar:
//   suportaWebhook: boolean
//   criarCobranca({ valor, vencimento, usuario }) => Promise<{ gateway_charge_id, link_pagamento }>
//   processarWebhook(payload) => Promise<{ gateway_charge_id, status: 'pago'|'cancelado' }>
const METODOS_OBRIGATORIOS = ['criarCobranca', 'processarWebhook'];

function assertGatewayAdapter(adapter) {
  for (const metodo of METODOS_OBRIGATORIOS) {
    if (typeof adapter[metodo] !== 'function') {
      throw new Error(`Adapter de gateway inválido: falta o método "${metodo}"`);
    }
  }
  return adapter;
}

module.exports = { assertGatewayAdapter };
