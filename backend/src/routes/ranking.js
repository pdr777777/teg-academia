const express = require('express');
const pool = require('../config/db');
const { authMiddleware } = require('../middleware/authMiddleware');

const router = express.Router();

// GET /api/ranking?tipo=mensal|semanal|geral
router.get('/', authMiddleware, async (req, res, next) => {
  try {
    const { tipo = 'mensal' } = req.query;

    let dateFilter;
    if (tipo === 'semanal') {
      dateFilter = "AND f.data >= CURRENT_DATE - INTERVAL '7 days'";
    } else if (tipo === 'mensal') {
      dateFilter = "AND DATE_TRUNC('month', f.data) = DATE_TRUNC('month', CURRENT_DATE)";
    } else {
      dateFilter = '';
    }

    const { rows } = await pool.query(
      `SELECT u.id, u.nome, u.foto_url, u.xp, u.sequencia_atual,
              COUNT(f.id)::int AS treinos
       FROM usuarios u
       LEFT JOIN frequencias f ON f.usuario_id = u.id ${dateFilter}
       WHERE u.role = 'aluno' AND u.ativo = TRUE
       GROUP BY u.id, u.nome, u.foto_url, u.xp, u.sequencia_atual
       ORDER BY treinos DESC, u.xp DESC
       LIMIT 50`
    );

    const comPosicao = rows.map((r, i) => ({ ...r, posicao: i + 1 }));
    const minha = comPosicao.find(r => r.id === req.user.id);

    res.json({ ranking: comPosicao, minha_posicao: minha || null });
  } catch (err) {
    next(err);
  }
});

// GET /api/ranking/conquistas/:usuarioId — só as próprias conquistas (o
// :usuarioId da URL é ignorado de propósito, ver comentário abaixo)
router.get('/conquistas/:usuarioId', authMiddleware, async (req, res, next) => {
  try {
    // Único caller (frontend/assets/js/ranking.js) sempre manda o próprio id,
    // mas nada impedia trocar o id na URL e ver as conquistas de outro aluno
    // (IDOR). Usa req.user.id (do token) em vez de confiar no path.
    const { rows } = await pool.query(
      `SELECT c.*, ac.desbloqueada_em
       FROM conquistas c
       LEFT JOIN aluno_conquistas ac ON ac.conquista_id = c.id AND ac.usuario_id = $1
       ORDER BY c.tipo, c.meta`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
