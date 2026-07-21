const express = require('express');
const pool = require('../config/db');
const { authMiddleware, requireRole } = require('../middleware/authMiddleware');

const router = express.Router();

// GET /api/configuracoes
router.get('/', authMiddleware, requireRole('admin', 'dono'), async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM configuracoes WHERE id = 1');
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/configuracoes (dono)
router.patch('/', authMiddleware, requireRole('dono'), async (req, res, next) => {
  try {
    const { nome_academia, meta_faturamento_mensal, meta_novos_alunos_mensal, dias_tolerancia_bloqueio, catraca_ativa } = req.body;
    const { rows } = await pool.query(
      `UPDATE configuracoes SET
         nome_academia = COALESCE($1, nome_academia),
         meta_faturamento_mensal = COALESCE($2, meta_faturamento_mensal),
         meta_novos_alunos_mensal = COALESCE($3, meta_novos_alunos_mensal),
         dias_tolerancia_bloqueio = COALESCE($4, dias_tolerancia_bloqueio),
         catraca_ativa = COALESCE($5, catraca_ativa),
         updated_at = NOW()
       WHERE id = 1 RETURNING *`,
      [nome_academia, meta_faturamento_mensal, meta_novos_alunos_mensal, dias_tolerancia_bloqueio, catraca_ativa]
    );
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
