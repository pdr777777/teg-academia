const express = require('express');
const pool = require('../config/db');
const { authMiddleware } = require('../middleware/authMiddleware');

const router = express.Router();

// GET /api/indicacoes/meu-link
router.get('/meu-link', authMiddleware, async (req, res, next) => {
  try {
    const { rows: [user] } = await pool.query(
      'SELECT link_indicacao FROM usuarios WHERE id = $1',
      [req.user.id]
    );
    const url = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/registro?ref=${user.link_indicacao}`;
    res.json({ link: url, codigo: user.link_indicacao });
  } catch (err) {
    next(err);
  }
});

// GET /api/indicacoes/minhas
router.get('/minhas', authMiddleware, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT i.*, l.nome as lead_nome, l.telefone as lead_telefone
       FROM indicacoes i
       LEFT JOIN leads l ON l.id = i.lead_id
       WHERE i.indicador_id = $1
       ORDER BY i.created_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /api/indicacoes/stats
router.get('/stats', authMiddleware, async (req, res, next) => {
  try {
    const { rows: [stats] } = await pool.query(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (WHERE status = 'convertido')::int AS convertidos,
         COUNT(*) FILTER (WHERE status = 'pendente')::int AS pendentes
       FROM indicacoes WHERE indicador_id = $1`,
      [req.user.id]
    );
    res.json(stats);
  } catch (err) {
    next(err);
  }
});

// GET /api/indicacoes/ref/:codigo — público, sem auth
// Usado na landing page personalizada de indicação
router.get('/ref/:codigo', async (req, res, next) => {
  try {
    const { rows: [indicador] } = await pool.query(
      `SELECT u.nome, u.foto_url,
              COUNT(i.id) FILTER (WHERE i.status = 'convertido')::int AS amigos_convertidos
       FROM usuarios u
       LEFT JOIN indicacoes i ON i.indicador_id = u.id
       WHERE u.link_indicacao = $1 AND u.ativo = TRUE
       GROUP BY u.nome, u.foto_url`,
      [req.params.codigo]
    );

    if (!indicador) return res.status(404).json({ error: 'Link inválido' });

    res.json({
      indicador: {
        nome: indicador.nome,
        foto_url: indicador.foto_url,
        amigos_convertidos: indicador.amigos_convertidos,
      },
      mensagem: `${indicador.nome} te convidou para a academia! Venha treinar com a gente. 💪`,
      codigo: req.params.codigo,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
