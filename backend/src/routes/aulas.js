const express = require('express');
const pool = require('../config/db');
const { authMiddleware, requireRole } = require('../middleware/authMiddleware');

const router = express.Router();

const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];

// GET /api/aulas (público — grade de horários para a landing)
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT a.*, u.nome as professor_nome FROM aulas a
       LEFT JOIN usuarios u ON u.id = a.professor_id
       WHERE a.ativo = TRUE ORDER BY a.dia_semana, a.hora_inicio`
    );
    const grade = DIAS.map((dia, i) => ({
      dia,
      aulas: rows.filter(a => a.dia_semana === i),
    }));
    res.json(grade);
  } catch (err) {
    next(err);
  }
});

// POST /api/aulas (admin)
router.post('/', authMiddleware, requireRole('admin', 'dono'), async (req, res, next) => {
  try {
    const { nome, professor_id, dia_semana, hora_inicio, hora_fim, capacidade_maxima } = req.body;
    const { rows: [aula] } = await pool.query(
      `INSERT INTO aulas (nome, professor_id, dia_semana, hora_inicio, hora_fim, capacidade_maxima)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [nome, professor_id, dia_semana, hora_inicio, hora_fim, capacidade_maxima || 20]
    );
    res.status(201).json(aula);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
