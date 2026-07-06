const express = require('express');
const pool = require('../config/db');
const { authMiddleware, requireRole } = require('../middleware/authMiddleware');
const whatsappService = require('../services/whatsappService');
const xpService = require('../services/xpService');

const router = express.Router();

// POST /api/matriculas (matrícula online — requer auth)
router.post('/', authMiddleware, async (req, res, next) => {
  try {
    const { plano_id } = req.body;
    if (!plano_id) return res.status(400).json({ error: 'plano_id é obrigatório' });

    const { rows: [plano] } = await pool.query('SELECT * FROM planos WHERE id = $1 AND ativo = TRUE', [plano_id]);
    if (!plano) return res.status(404).json({ error: 'Plano não encontrado' });

    const data_vencimento = new Date();
    data_vencimento.setDate(data_vencimento.getDate() + plano.duracao_dias);

    const { rows: [matricula] } = await pool.query(
      `INSERT INTO matriculas (usuario_id, plano_id, data_vencimento)
       VALUES ($1, $2, $3) RETURNING *`,
      [req.user.id, plano_id, data_vencimento]
    );

    await pool.query(
      `INSERT INTO pagamentos (matricula_id, usuario_id, valor, status)
       VALUES ($1, $2, $3, 'pendente')`,
      [matricula.id, req.user.id, plano.preco_mensal]
    );

    const { rows: [user] } = await pool.query('SELECT nome, telefone FROM usuarios WHERE id = $1', [req.user.id]);
    await whatsappService.enviarBoasVindas(user.telefone, user.nome, plano.nome);
    await xpService.adicionarXP(req.user.id, 100, 'matricula');

    const { rows: [indicacao] } = await pool.query(
      `UPDATE indicacoes SET status = 'convertido', convertido_em = NOW()
       WHERE indicado_id = $1 AND status = 'pendente'
       RETURNING indicador_id`,
      [req.user.id]
    );
    if (indicacao) {
      await xpService.adicionarXP(indicacao.indicador_id, 200, 'indicacao');
    }

    res.status(201).json(matricula);
  } catch (err) {
    next(err);
  }
});

// GET /api/matriculas/minha
router.get('/minha', authMiddleware, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT m.*, p.nome as plano_nome, p.preco_mensal
       FROM matriculas m JOIN planos p ON p.id = m.plano_id
       WHERE m.usuario_id = $1 ORDER BY m.created_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /api/matriculas (admin)
router.get('/', authMiddleware, requireRole('admin', 'dono'), async (req, res, next) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const conditions = status ? ['m.status = $3'] : [];
    const params = [limit, offset, ...(status ? [status] : [])];

    const { rows } = await pool.query(
      `SELECT m.*, u.nome, u.email, u.telefone, p.nome as plano_nome
       FROM matriculas m
       JOIN usuarios u ON u.id = m.usuario_id
       JOIN planos p ON p.id = m.plano_id
       ${conditions.length ? 'WHERE ' + conditions.join(' AND ') : ''}
       ORDER BY m.created_at DESC LIMIT $1 OFFSET $2`,
      params
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
