const express = require('express');
const pool = require('../config/db');
const { authMiddleware, requireRole } = require('../middleware/authMiddleware');

const router = express.Router();

// GET /api/planos (público — usado na matrícula online)
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM planos WHERE ativo = TRUE ORDER BY preco_mensal');
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// POST /api/planos (admin/dono)
router.post('/', authMiddleware, requireRole('admin', 'dono'), async (req, res, next) => {
  try {
    const { nome, descricao, preco_mensal, duracao_dias } = req.body;
    const { rows } = await pool.query(
      'INSERT INTO planos (nome, descricao, preco_mensal, duracao_dias) VALUES ($1, $2, $3, $4) RETURNING *',
      [nome, descricao, preco_mensal, duracao_dias || 30]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// PUT /api/planos/:id (admin/dono)
router.put('/:id', authMiddleware, requireRole('admin', 'dono'), async (req, res, next) => {
  try {
    const { nome, descricao, preco_mensal, duracao_dias, ativo } = req.body;
    const { rows } = await pool.query(
      `UPDATE planos SET nome = COALESCE($1, nome), descricao = COALESCE($2, descricao),
       preco_mensal = COALESCE($3, preco_mensal), duracao_dias = COALESCE($4, duracao_dias),
       ativo = COALESCE($5, ativo) WHERE id = $6 RETURNING *`,
      [nome, descricao, preco_mensal, duracao_dias, ativo, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Plano não encontrado' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
