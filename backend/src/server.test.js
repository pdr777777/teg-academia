const request = require('supertest');
const app = require('./server');
const pool = require('./config/db');

afterAll(async () => {
  await pool.end();
});

describe('GET /health', () => {
  test('retorna status ok com latência do banco', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.dependencies.database.status).toBe('ok');
    expect(typeof res.body.dependencies.database.latencyMs).toBe('number');
  });
});

describe('GET /metrics', () => {
  test('expõe métricas no formato Prometheus', async () => {
    const res = await request(app).get('/metrics');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/text\/plain/);
    expect(res.text).toMatch(/process_cpu_user_seconds_total/);
  });
});

describe('X-Request-ID', () => {
  test('propaga o header em toda resposta', async () => {
    const res = await request(app).get('/health');
    expect(res.headers['x-request-id']).toBeDefined();
  });

  test('respeita o X-Request-ID enviado pelo cliente', async () => {
    const res = await request(app).get('/health').set('X-Request-ID', 'meu-id-customizado');
    expect(res.headers['x-request-id']).toBe('meu-id-customizado');
  });
});
