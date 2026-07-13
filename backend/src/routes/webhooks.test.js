// backend/src/routes/webhooks.test.js
const request = require('supertest');
const app = require('../server');

describe('POST /api/webhooks/pagamento', () => {
  const originalGateway = process.env.PAYMENT_GATEWAY;
  afterEach(() => {
    process.env.PAYMENT_GATEWAY = originalGateway;
  });

  test('retorna 404 quando o gateway ativo (manual) não suporta webhook', async () => {
    delete process.env.PAYMENT_GATEWAY;
    const res = await request(app).post('/api/webhooks/pagamento').send({});
    expect(res.status).toBe(404);
    expect(res.body.error).toMatch(/não recebe webhook/);
  });
});
