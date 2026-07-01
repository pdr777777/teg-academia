const express = require('express');
const pool = require('../config/db');
const { authMiddleware, requireRole } = require('../middleware/authMiddleware');

const router = express.Router();

// GET /api/pagamentos/meus
router.get('/meus', authMiddleware, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT p.*, pl.nome as plano_nome FROM pagamentos p
       JOIN matriculas m ON m.id = p.matricula_id
       JOIN planos pl ON pl.id = m.plano_id
       WHERE p.usuario_id = $1 ORDER BY p.created_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/pagamentos/:id/confirmar (admin)
router.patch('/:id/confirmar', authMiddleware, requireRole('admin', 'dono'), async (req, res, next) => {
  try {
    const { metodo = 'dinheiro' } = req.body;
    const { rows: [pag] } = await pool.query(
      `UPDATE pagamentos SET status = 'pago', metodo = $1, data_pagamento = NOW()
       WHERE id = $2 RETURNING *`,
      [metodo, req.params.id]
    );
    if (!pag) return res.status(404).json({ error: 'Pagamento não encontrado' });
    res.json(pag);
  } catch (err) {
    next(err);
  }
});

// GET /api/pagamentos (admin)
router.get('/', authMiddleware, requireRole('admin', 'dono'), async (req, res, next) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const params = [limit, offset];
    const conditions = status ? [`p.status = $${params.push(status)}`] : [];

    const { rows } = await pool.query(
      `SELECT p.*, u.nome, u.email, pl.nome as plano_nome
       FROM pagamentos p
       JOIN usuarios u ON u.id = p.usuario_id
       JOIN matriculas m ON m.id = p.matricula_id
       JOIN planos pl ON pl.id = m.plano_id
       ${conditions.length ? 'WHERE ' + conditions.join(' AND ') : ''}
       ORDER BY p.created_at DESC LIMIT $1 OFFSET $2`,
      params
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
