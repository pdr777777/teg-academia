// backend/src/routes/whatsapp.test.js
const crypto = require('crypto');
const request = require('supertest');
const app = require('../server');

describe('POST /api/whatsapp/webhook', () => {
  const originalSecret = process.env.WHATSAPP_APP_SECRET;
  const segredo = 'segredo-de-teste';
  const payload = { entry: [] };
  const rawBody = JSON.stringify(payload);

  function assinar(body, secret) {
    return `sha256=${crypto.createHmac('sha256', secret).update(body).digest('hex')}`;
  }

  beforeEach(() => {
    process.env.WHATSAPP_APP_SECRET = segredo;
  });

  afterAll(() => {
    process.env.WHATSAPP_APP_SECRET = originalSecret;
  });

  test('rejeita requisição sem header de assinatura', async () => {
    const res = await request(app).post('/api/whatsapp/webhook').send(payload);
    expect(res.status).toBe(401);
  });

  test('rejeita requisição com assinatura inválida', async () => {
    const res = await request(app)
      .post('/api/whatsapp/webhook')
      .set('X-Hub-Signature-256', 'sha256=0000000000000000000000000000000000000000000000000000000000000000')
      .send(payload);
    expect(res.status).toBe(401);
  });

  test('rejeita requisição assinada com outro segredo', async () => {
    const assinaturaErrada = assinar(rawBody, 'segredo-errado');
    const res = await request(app)
      .post('/api/whatsapp/webhook')
      .set('X-Hub-Signature-256', assinaturaErrada)
      .send(payload);
    expect(res.status).toBe(401);
  });

  test('aceita requisição com assinatura válida', async () => {
    const assinaturaValida = assinar(rawBody, segredo);
    const res = await request(app)
      .post('/api/whatsapp/webhook')
      .set('X-Hub-Signature-256', assinaturaValida)
      .send(payload);
    expect(res.status).toBe(200);
  });

  test('retorna 500 quando WHATSAPP_APP_SECRET não está configurado', async () => {
    delete process.env.WHATSAPP_APP_SECRET;
    const res = await request(app)
      .post('/api/whatsapp/webhook')
      .set('X-Hub-Signature-256', 'sha256=abc')
      .send(payload);
    expect(res.status).toBe(500);
  });
});
