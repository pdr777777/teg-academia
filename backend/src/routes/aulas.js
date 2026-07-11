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

// GET /api/aulas/admin — grade completa (inclui inativas) pra gestão
router.get('/admin', authMiddleware, requireRole('admin', 'dono'), async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT a.*, u.nome as professor_nome FROM aulas a
       LEFT JOIN usuarios u ON u.id = a.professor_id
       ORDER BY a.dia_semana, a.hora_inicio`
    );
    res.json(rows.map((a) => ({ ...a, dia_semana_nome: DIAS[a.dia_semana] })));
  } catch (err) {
    next(err);
  }
});

// GET /api/aulas/professores — lookup pro select de professor no cadastro de aula
router.get('/professores', authMiddleware, requireRole('admin', 'dono'), async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, nome FROM usuarios WHERE role = 'professor' AND ativo = TRUE ORDER BY nome`
    );
    res.json(rows);
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
      [nome, professor_id || null, dia_semana, hora_inicio, hora_fim, capacidade_maxima || 20]
    );
    res.status(201).json(aula);
  } catch (err) {
    next(err);
  }
});

// PUT /api/aulas/:id (admin)
router.put('/:id', authMiddleware, requireRole('admin', 'dono'), async (req, res, next) => {
  try {
    const { nome, professor_id, dia_semana, hora_inicio, hora_fim, capacidade_maxima, ativo } = req.body;
    const { rows: [aula] } = await pool.query(
      `UPDATE aulas SET
         nome = COALESCE($1, nome),
         professor_id = $2,
         dia_semana = COALESCE($3, dia_semana),
         hora_inicio = COALESCE($4, hora_inicio),
         hora_fim = COALESCE($5, hora_fim),
         capacidade_maxima = COALESCE($6, capacidade_maxima),
         ativo = COALESCE($7, ativo)
       WHERE id = $8 RETURNING *`,
      [nome, professor_id || null, dia_semana, hora_inicio, hora_fim, capacidade_maxima, ativo, req.params.id]
    );
    if (!aula) return res.status(404).json({ error: 'Aula não encontrada' });
    res.json(aula);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/aulas/:id/toggle (admin) — ativar/desativar sem mexer no resto
router.patch('/:id/toggle', authMiddleware, requireRole('admin', 'dono'), async (req, res, next) => {
  try {
    const { rows: [aula] } = await pool.query(
      `UPDATE aulas SET ativo = NOT ativo WHERE id = $1 RETURNING id, nome, ativo`,
      [req.params.id]
    );
    if (!aula) return res.status(404).json({ error: 'Aula não encontrada' });
    res.json(aula);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
