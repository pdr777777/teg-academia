const express = require('express');
const pool = require('../config/db');
const { authMiddleware, requireRole } = require('../middleware/authMiddleware');

const router = express.Router();

// GET /api/treinos/meu — treino ativo do aluno logado
router.get('/meu', authMiddleware, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT t.id, t.nome, t.descricao,
              json_agg(
                json_build_object(
                  'id', te.id, 'ordem', te.ordem, 'series', te.series,
                  'repeticoes', te.repeticoes, 'carga', te.carga,
                  'descanso_segundos', te.descanso_segundos, 'observacoes', te.observacoes,
                  'exercicio', json_build_object('id', e.id, 'nome', e.nome, 'video_url', e.video_url, 'grupo_muscular', e.grupo_muscular)
                ) ORDER BY te.ordem
              ) AS exercicios
       FROM treino_alunos ta
       JOIN treinos t ON t.id = ta.treino_id
       LEFT JOIN treino_exercicios te ON te.treino_id = t.id
       LEFT JOIN exercicios e ON e.id = te.exercicio_id
       WHERE ta.usuario_id = $1 AND ta.ativo = TRUE
       GROUP BY t.id, t.nome, t.descricao`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// POST /api/treinos (professor/admin)
router.post('/', authMiddleware, requireRole('professor', 'admin', 'dono'), async (req, res, next) => {
  try {
    const { nome, descricao, exercicios = [] } = req.body;
    const { rows: [treino] } = await pool.query(
      'INSERT INTO treinos (nome, descricao, professor_id) VALUES ($1, $2, $3) RETURNING *',
      [nome, descricao, req.user.id]
    );

    for (let i = 0; i < exercicios.length; i++) {
      const { exercicio_id, series, repeticoes, carga, descanso_segundos, observacoes } = exercicios[i];
      await pool.query(
        `INSERT INTO treino_exercicios (treino_id, exercicio_id, series, repeticoes, carga, descanso_segundos, ordem, observacoes)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [treino.id, exercicio_id, series, repeticoes, carga, descanso_segundos, i, observacoes]
      );
    }

    res.status(201).json(treino);
  } catch (err) {
    next(err);
  }
});

// POST /api/treinos/:id/atribuir/:usuarioId (professor/admin)
router.post('/:id/atribuir/:usuarioId', authMiddleware, requireRole('professor', 'admin', 'dono'), async (req, res, next) => {
  try {
    await pool.query(
      'UPDATE treino_alunos SET ativo = FALSE WHERE usuario_id = $1',
      [req.params.usuarioId]
    );
    await pool.query(
      'INSERT INTO treino_alunos (treino_id, usuario_id) VALUES ($1, $2)',
      [req.params.id, req.params.usuarioId]
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// GET /api/treinos/exercicios (biblioteca)
router.get('/exercicios', authMiddleware, async (req, res, next) => {
  try {
    const { grupo } = req.query;
    const params = grupo ? [grupo] : [];
    const { rows } = await pool.query(
      `SELECT * FROM exercicios ${grupo ? 'WHERE grupo_muscular = $1' : ''} ORDER BY nome`,
      params
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
