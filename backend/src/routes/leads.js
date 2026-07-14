const express = require('express');
const pool = require('../config/db');
const { authMiddleware, requireRole } = require('../middleware/authMiddleware');

const router = express.Router();

const PIPELINE_ETAPAS = ['novo_lead', 'contato', 'visitou', 'matriculado', 'perdido'];

// POST /api/leads (público — CTA da landing page)
router.post('/', async (req, res, next) => {
  try {
    const { nome, telefone, email, objetivo, origem = 'site', ref } = req.body;
    if (!nome || !telefone) return res.status(400).json({ error: 'nome e telefone são obrigatórios' });

    let indicador_id = null;
    if (ref) {
      const { rows } = await pool.query('SELECT id FROM usuarios WHERE link_indicacao = $1', [ref]);
      if (rows[0]) indicador_id = rows[0].id;
    }

    const { rows: [lead] } = await pool.query(
      `INSERT INTO leads (nome, telefone, email, objetivo, origem, indicador_id)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [nome, telefone, email, objetivo, indicador_id ? 'indicacao' : origem, indicador_id]
    );

    if (indicador_id) {
      await pool.query(
        'INSERT INTO indicacoes (indicador_id, lead_id) VALUES ($1, $2)',
        [indicador_id, lead.id]
      );
    }

    await pool.query(
      `INSERT INTO pipeline_historico (lead_id, status_novo) VALUES ($1, 'novo_lead')`,
      [lead.id]
    );

    res.status(201).json({ ok: true, lead_id: lead.id });
  } catch (err) {
    next(err);
  }
});

// GET /api/leads (admin)
router.get('/', authMiddleware, requireRole('admin', 'dono'), async (req, res, next) => {
  try {
    const { status, busca, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const conditions = [];
    const params = [limit, offset];

    if (status) { conditions.push(`l.status_pipeline = $${params.push(status)}`); }
    if (busca) { conditions.push(`(l.nome ILIKE $${params.push('%' + busca + '%')} OR l.telefone ILIKE $${params.push('%' + busca + '%')})`); }

    const { rows } = await pool.query(
      `SELECT l.*, u.nome as indicador_nome
       FROM leads l LEFT JOIN usuarios u ON u.id = l.indicador_id
       ${conditions.length ? 'WHERE ' + conditions.join(' AND ') : ''}
       ORDER BY l.created_at DESC LIMIT $1 OFFSET $2`,
      params
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/leads/:id/pipeline (mover no kanban)
router.patch('/:id/pipeline', authMiddleware, requireRole('admin', 'dono'), async (req, res, next) => {
  try {
    const { status_novo, observacao } = req.body;
    if (!PIPELINE_ETAPAS.includes(status_novo)) {
      return res.status(400).json({ error: 'Status inválido' });
    }

    // CTE captura status_anterior ANTES do update
    const { rows: [lead] } = await pool.query(
      `WITH anterior AS (SELECT status_pipeline FROM leads WHERE id = $2)
       UPDATE leads SET status_pipeline = $1, updated_at = NOW() WHERE id = $2
       RETURNING *, (SELECT status_pipeline FROM anterior) AS status_anterior`,
      [status_novo, req.params.id]
    );
    if (!lead) return res.status(404).json({ error: 'Lead não encontrado' });

    await pool.query(
      `INSERT INTO pipeline_historico (lead_id, status_anterior, status_novo, observacao, usuario_id)
       VALUES ($1, $2, $3, $4, $5)`,
      [lead.id, lead.status_anterior, status_novo, observacao, req.user.id]
    );

    res.json(lead);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
