// backend/src/services/gateway/index.js
const { assertGatewayAdapter } = require('./gatewayAdapter');
const manualAdapter = require('./manualAdapter');

// Trocar de gateway = implementar um novo <nome>Adapter.js com o mesmo
// contrato de gatewayAdapter.js, registrar aqui, e mudar a env var.
const ADAPTERS = {
  manual: manualAdapter,
};

function getGatewayAdapter() {
  const nome = process.env.PAYMENT_GATEWAY || 'manual';
  const adapter = ADAPTERS[nome];
  if (!adapter) throw new Error(`Gateway de pagamento desconhecido: ${nome}`);
  return assertGatewayAdapter(adapter);
}

module.exports = { getGatewayAdapter };
