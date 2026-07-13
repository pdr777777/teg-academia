// backend/src/services/gateway/manualAdapter.js
// Adapter ativo por padrão: nenhuma chamada externa, pagamento fica
// pendente sem link — confirmado à mão pelo admin, igual ao fluxo atual.
const manualAdapter = {
  suportaWebhook: false,

  async criarCobranca({ valor, vencimento, usuario }) {
    return { gateway_charge_id: null, link_pagamento: null };
  },

  async processarWebhook(payload) {
    throw new Error('Adapter manual não recebe webhook');
  },
};

module.exports = manualAdapter;
