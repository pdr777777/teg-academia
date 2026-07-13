const express = require('express');
const pool = require('../config/db');
const { authMiddleware, requireRole } = require('../middleware/authMiddleware');
const xpService = require('../services/xpService');

const router = express.Router();

// GET /api/pagamentos/meus
router.get('/meus', authMiddleware, async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT p.*, pl.nome as plano_nome FROM pagamentos p
       JOIN matriculas m ON m.id = p.matricula_id
       JOIN planos pl ON pl.id = m.plano_id
       WHERE p.usuario_id = $1 ORDER BY p.created_at DESC`,
      [req.user.id]
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/pagamentos/:id/confirmar (admin)
router.patch('/:id/confirmar', authMiddleware, requireRole('admin', 'dono'), async (req, res, next) => {
  try {
    const { metodo = 'dinheiro' } = req.body;
    const { rows: [pag] } = await pool.query(
      `UPDATE pagamentos SET status = 'pago', metodo = $1, data_pagamento = NOW()
       WHERE id = $2 RETURNING *`,
      [metodo, req.params.id]
    );
    if (!pag) return res.status(404).json({ error: 'Pagamento não encontrado' });

    if (pag.gerado_automaticamente) {
      // Renovação automática confirmada: estende o ciclo a partir do maior
      // entre agora e o vencimento atual, e reativa a matrícula.
      const { rows: [matricula] } = await pool.query(
        `SELECT m.*, p.duracao_dias FROM matriculas m JOIN planos p ON p.id = m.plano_id WHERE m.id = $1`,
        [pag.matricula_id]
      );
      const base = new Date(Math.max(Date.now(), new Date(matricula.data_vencimento).getTime()));
      base.setDate(base.getDate() + matricula.duracao_dias);
      await pool.query(
        `UPDATE matriculas SET status = 'ativa', data_vencimento = $1, updated_at = NOW() WHERE id = $2`,
        [base, pag.matricula_id]
      );
    } else {
      // Matrícula criada sem pagamento imediato (fluxo existente do admin)
      const { rows: [matriculaAtivada] } = await pool.query(
        `UPDATE matriculas SET status = 'ativa', updated_at = NOW()
         WHERE id = $1 AND status = 'suspensa'
         RETURNING usuario_id`,
        [pag.matricula_id]
      );
      if (matriculaAtivada) {
        await xpService.adicionarXP(matriculaAtivada.usuario_id, 100, 'matricula');
        const { rows: [indicacao] } = await pool.query(
          `UPDATE indicacoes SET status = 'convertido', convertido_em = NOW()
           WHERE indicado_id = $1 AND status = 'pendente'
           RETURNING indicador_id`,
          [matriculaAtivada.usuario_id]
        );
        if (indicacao) {
          await xpService.adicionarXP(indicacao.indicador_id, 200, 'indicacao');
        }
      }
    }

    res.json(pag);
  } catch (err) {
    next(err);
  }
});

// GET /api/pagamentos (admin)
router.get('/', authMiddleware, requireRole('admin', 'dono'), async (req, res, next) => {
  try {
    const { status, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const params = [limit, offset];
    const conditions = status ? [`p.status = $${params.push(status)}`] : [];

    const { rows } = await pool.query(
      `SELECT p.*, u.nome, u.email, pl.nome as plano_nome
       FROM pagamentos p
       JOIN usuarios u ON u.id = p.usuario_id
       JOIN matriculas m ON m.id = p.matricula_id
       JOIN planos pl ON pl.id = m.plano_id
       ${conditions.length ? 'WHERE ' + conditions.join(' AND ') : ''}
       ORDER BY p.created_at DESC LIMIT $1 OFFSET $2`,
      params
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
