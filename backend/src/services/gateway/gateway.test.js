// backend/src/services/gateway/gateway.test.js
const { getGatewayAdapter } = require('./index');
const manualAdapter = require('./manualAdapter');

describe('getGatewayAdapter', () => {
  const originalEnv = process.env.PAYMENT_GATEWAY;
  afterEach(() => {
    process.env.PAYMENT_GATEWAY = originalEnv;
  });

  test('retorna o adapter manual por padrão quando PAYMENT_GATEWAY não definido', () => {
    delete process.env.PAYMENT_GATEWAY;
    expect(getGatewayAdapter()).toBe(manualAdapter);
  });

  test('lança erro para gateway desconhecido', () => {
    process.env.PAYMENT_GATEWAY = 'inexistente';
    expect(() => getGatewayAdapter()).toThrow('Gateway de pagamento desconhecido: inexistente');
  });
});

describe('manualAdapter', () => {
  test('não suporta webhook', () => {
    expect(manualAdapter.suportaWebhook).toBe(false);
  });

  test('criarCobranca retorna sem link nem id (fluxo manual/recepção)', async () => {
    const resultado = await manualAdapter.criarCobranca({
      valor: 109.9,
      vencimento: new Date(),
      usuario: { id: 1, telefone: '67999999999' },
    });
    expect(resultado).toEqual({ gateway_charge_id: null, link_pagamento: null });
  });

  test('processarWebhook rejeita (adapter manual não recebe webhook)', async () => {
    await expect(manualAdapter.processarWebhook({})).rejects.toThrow();
  });
});
