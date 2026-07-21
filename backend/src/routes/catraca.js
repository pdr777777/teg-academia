// backend/src/routes/catraca.js
const express = require('express');
const pool = require('../config/db');
const { authMiddleware, requireRole } = require('../middleware/authMiddleware');
const catracaService = require('../services/catracaService');

const router = express.Router();

// GET /api/catraca/status (admin/dono) — dados pro dashboard
router.get('/status', authMiddleware, requireRole('admin', 'dono'), async (req, res, next) => {
  try {
    const catracas = await catracaService.verificarSaude();

    const { rows: [contagens] } = await pool.query(`
      SELECT
        COUNT(*) FILTER (WHERE face_status = 'sincronizado')::int AS sincronizados,
        COUNT(*) FILTER (WHERE face_status = 'pendente_presencial')::int AS pendentes_presencial
      FROM catraca_usuarios
    `);

    const { rows: [{ total: acessos_hoje }] } = await pool.query(`
      SELECT COUNT(*)::int AS total FROM catraca_eventos
      WHERE tipo = 'autorizado' AND criado_em::date = CURRENT_DATE
    `);

    const { rows: grafico_acessos } = await pool.query(`
      SELECT date_trunc('hour', criado_em) AS hora, COUNT(*)::int AS total
      FROM catraca_eventos
      WHERE tipo = 'autorizado' AND criado_em >= NOW() - INTERVAL '3 days'
      GROUP BY hora ORDER BY hora
    `);

    const { rows: feed } = await pool.query(`
      SELECT ce.criado_em, ce.catraca, ce.tipo, u.nome
      FROM catraca_eventos ce LEFT JOIN usuarios u ON u.id = ce.usuario_id
      ORDER BY ce.criado_em DESC LIMIT 20
    `);

    res.json({
      catracas,
      sincronizados: contagens.sincronizados,
      pendentes_presencial: contagens.pendentes_presencial,
      acessos_hoje,
      grafico_acessos,
      feed,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/catraca/:usuarioId/sincronizar (admin/dono) — força re-sync manual
router.post('/:usuarioId/sincronizar', authMiddleware, requireRole('admin', 'dono'), async (req, res, next) => {
  try {
    await catracaService.sincronizarAluno(Number(req.params.usuarioId));
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// POST /api/catraca/:usuarioId/verificar-rosto (admin/dono) — confirma cadastro facial feito direto no equipamento
router.post('/:usuarioId/verificar-rosto', authMiddleware, requireRole('admin', 'dono'), async (req, res, next) => {
  try {
    const resultados = await catracaService.verificarRostoCadastrado(Number(req.params.usuarioId));
    res.json({ resultados });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
