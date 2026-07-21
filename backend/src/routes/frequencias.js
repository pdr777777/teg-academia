const express = require('express');
const pool = require('../config/db');
const { authMiddleware, requireRole } = require('../middleware/authMiddleware');
const frequenciaService = require('../services/frequenciaService');

const router = express.Router();

// POST /api/frequencias/checkin
router.post('/checkin', authMiddleware, async (req, res, next) => {
  try {
    const freq = await frequenciaService.registrarCheckin(req.user.id, 'app');
    if (!freq) return res.status(409).json({ error: 'Check-in já realizado hoje' });
    res.status(201).json(freq);
  } catch (err) {
    next(err);
  }
});

// GET /api/frequencias/minha?mes=2026-06
router.get('/minha', authMiddleware, async (req, res, next) => {
  try {
    const { mes } = req.query;
    const params = [req.user.id];
    let dateFilter = '';
    if (mes) {
      dateFilter = "AND TO_CHAR(data, 'YYYY-MM') = $2";
      params.push(mes);
    }

    const { rows } = await pool.query(
      `SELECT data, hora_entrada FROM frequencias WHERE usuario_id = $1 ${dateFilter} ORDER BY data DESC`,
      params
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// GET /api/frequencias/resumo (admin/professor) — quem está sumindo, base pro lembrete de ausência
router.get('/resumo', authMiddleware, requireRole('admin', 'dono', 'professor'), async (req, res, next) => {
  try {
    const { rows: alunos } = await pool.query(
      `SELECT u.id, u.nome, u.email, u.telefone,
              MAX(f.data) AS ultimo_treino,
              (CURRENT_DATE - COALESCE(MAX(f.data), u.created_at::date))::int AS dias_ausente,
              COUNT(f.id) FILTER (WHERE DATE_TRUNC('month', f.data) = DATE_TRUNC('month', CURRENT_DATE))::int AS treinos_mes
       FROM usuarios u
       LEFT JOIN frequencias f ON f.usuario_id = u.id
       WHERE u.role = 'aluno' AND u.ativo = TRUE
       GROUP BY u.id, u.nome, u.email, u.telefone, u.created_at
       ORDER BY dias_ausente DESC, u.nome`
    );

    const { rows: [hojeRow] } = await pool.query(
      `SELECT COUNT(DISTINCT usuario_id)::int AS total FROM frequencias WHERE data = CURRENT_DATE`
    );

    res.json({
      treinaram_hoje: hojeRow.total,
      sumidos: alunos.filter((a) => a.dias_ausente > 14).length,
      total_alunos_ativos: alunos.length,
      alunos,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/frequencias (admin/professor)
router.get('/', authMiddleware, requireRole('admin', 'dono', 'professor'), async (req, res, next) => {
  try {
    const { data } = req.query;
    const params = data ? [data] : [new Date().toISOString().split('T')[0]];
    const { rows } = await pool.query(
      `SELECT f.*, u.nome, u.email FROM frequencias f
       JOIN usuarios u ON u.id = f.usuario_id
       WHERE f.data = $1 ORDER BY f.hora_entrada DESC`,
      params
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
