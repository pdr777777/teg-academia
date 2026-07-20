// backend/src/routes/webhooks.catraca.test.js
//
// Separado de webhooks.test.js porque estes testes precisam mockar
// '../services/gateway' inteiro (para simular um gateway com suportaWebhook:
// true) e o jest.mock desse módulo é hoisted para o topo do arquivo, afetando
// TODOS os testes do arquivo — inclusive o teste existente em
// webhooks.test.js que depende do adapter manual REAL (suportaWebhook: false)
// para verificar o 404. Isolar em outro arquivo evita que o mock de um
// interfira no outro.
const request = require('supertest');
const crypto = require('crypto');

jest.mock('../services/gateway');
jest.mock('../services/catracaService');

const { getGatewayAdapter } = require('../services/gateway');
const catracaService = require('../services/catracaService');
const app = require('../server');
const pool = require('../config/db');
const { criarUsuario, criarPlano, criarMatricula } = require('../testUtils/fixtures');

describe('POST /api/webhooks/pagamento — integração com a catraca', () => {
  afterAll(async () => {
    await pool.end();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  async function criarFixturePendente(chargeId) {
    const aluno = await criarUsuario({ role: 'aluno' });
    const plano = await criarPlano({ duracao_dias: 30 });
    const matricula = await criarMatricula({
      usuario_id: aluno.id,
      plano_id: plano.id,
      status: 'suspensa',
      data_vencimento: new Date(Date.now() - 5 * 86400000),
    });
    const { rows: [pagamento] } = await pool.query(
      `INSERT INTO pagamentos (matricula_id, usuario_id, valor, status, gateway, gateway_charge_id)
       VALUES ($1, $2, $3, 'pendente', 'teste', $4) RETURNING *`,
      [matricula.id, aluno.id, plano.preco_mensal, chargeId]
    );
    return { aluno, plano, matricula, pagamento };
  }

  async function limpar({ aluno, plano, matricula, pagamento }) {
    await pool.query('DELETE FROM pagamentos WHERE id = $1', [pagamento.id]);
    await pool.query('DELETE FROM matriculas WHERE id = $1', [matricula.id]);
    await pool.query('DELETE FROM usuarios WHERE id = $1', [aluno.id]);
    await pool.query('DELETE FROM planos WHERE id = $1', [plano.id]);
  }

  test('libera acesso na catraca quando o webhook confirma o pagamento', async () => {
    catracaService.liberarAcesso.mockResolvedValue(undefined);
    const chargeId = `charge-teste-catraca-${crypto.randomUUID()}`;
    const fixture = await criarFixturePendente(chargeId);

    getGatewayAdapter.mockReturnValue({
      suportaWebhook: true,
      processarWebhook: jest.fn().mockResolvedValue({
        gateway_charge_id: chargeId,
        status: 'pago',
      }),
    });

    const res = await request(app).post('/api/webhooks/pagamento').send({});

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(catracaService.liberarAcesso).toHaveBeenCalledWith(fixture.aluno.id);

    await limpar(fixture);
  });

  test('não falha a resposta do webhook quando a catraca está offline', async () => {
    catracaService.liberarAcesso.mockRejectedValue(new Error('Catraca catraca1 inacessível'));
    const chargeId = `charge-teste-catraca-${crypto.randomUUID()}`;
    const fixture = await criarFixturePendente(chargeId);

    getGatewayAdapter.mockReturnValue({
      suportaWebhook: true,
      processarWebhook: jest.fn().mockResolvedValue({
        gateway_charge_id: chargeId,
        status: 'pago',
      }),
    });

    const res = await request(app).post('/api/webhooks/pagamento').send({});

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);

    await limpar(fixture);
  });
});
