const express = require('express');
const pool = require('../config/db');
const { authMiddleware, requireRole } = require('../middleware/authMiddleware');
const xpService = require('../services/xpService');

const router = express.Router();

// POST /api/frequencias/checkin
router.post('/checkin', authMiddleware, async (req, res, next) => {
  try {
    const hoje = new Date().toISOString().split('T')[0];

    const { rows: existing } = await pool.query(
      'SELECT id FROM frequencias WHERE usuario_id = $1 AND data = $2',
      [req.user.id, hoje]
    );
    if (existing[0]) return res.status(409).json({ error: 'Check-in já realizado hoje' });

    const { rows: [freq] } = await pool.query(
      'INSERT INTO frequencias (usuario_id, data) VALUES ($1, $2) RETURNING *',
      [req.user.id, hoje]
    );

    await xpService.adicionarXP(req.user.id, 50, 'treino');
    await xpService.atualizarSequencia(req.user.id);

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

// GET /api/frequencias (admin)
router.get('/', authMiddleware, requireRole('admin', 'dono'), async (req, res, next) => {
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
