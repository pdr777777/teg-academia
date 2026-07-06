const express = require('express');
const pool = require('../config/db');
const { authMiddleware, requireRole } = require('../middleware/authMiddleware');

const router = express.Router();

// GET /api/admin/stats — métricas públicas para a landing page
router.get('/stats', async (req, res, next) => {
  try {
    const [alunos, planos] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS total FROM matriculas WHERE status = 'ativa'`),
      pool.query(`SELECT COUNT(*)::int AS total FROM planos WHERE ativo = true`),
    ]);
    res.json({
      alunos_ativos: alunos.rows[0].total,
      modalidades: planos.rows[0].total,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/dashboard — métricas do dono
router.get('/dashboard', authMiddleware, requireRole('admin', 'dono'), async (req, res, next) => {
  try {
    const [ativos, faturamento, inadimplentes, novos, cancelamentos] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS total FROM matriculas WHERE status = 'ativa'`),
      pool.query(`SELECT COALESCE(SUM(valor), 0)::numeric AS total FROM pagamentos WHERE status = 'pago' AND DATE_TRUNC('month', data_pagamento) = DATE_TRUNC('month', NOW())`),
      pool.query(`SELECT COUNT(*)::int AS total FROM matriculas WHERE status = 'vencida'`),
      pool.query(`SELECT COUNT(*)::int AS total FROM usuarios WHERE role = 'aluno' AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())`),
      pool.query(`SELECT COUNT(*)::int AS total FROM matriculas WHERE status = 'cancelada' AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())`),
    ]);

    const { rows: ticketRow } = await pool.query(
      `SELECT COALESCE(AVG(p.valor), 0)::numeric AS ticket_medio
       FROM pagamentos p WHERE p.status = 'pago'`
    );

    const { rows: grafico } = await pool.query(
      `SELECT TO_CHAR(data_pagamento, 'YYYY-MM') AS mes, SUM(valor)::numeric AS faturamento
       FROM pagamentos WHERE status = 'pago' AND data_pagamento >= NOW() - INTERVAL '6 months'
       GROUP BY mes ORDER BY mes`
    );

    res.json({
      alunos_ativos: ativos.rows[0].total,
      faturamento_mes: faturamento.rows[0].total,
      inadimplentes: inadimplentes.rows[0].total,
      novos_mes: novos.rows[0].total,
      cancelamentos_mes: cancelamentos.rows[0].total,
      ticket_medio: ticketRow[0].ticket_medio,
      grafico_faturamento: grafico,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/alunos
router.get('/alunos', authMiddleware, requireRole('admin', 'dono'), async (req, res, next) => {
  try {
    const { busca, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const params = [limit, offset];
    let where = "WHERE u.role = 'aluno'";
    if (busca) where += ` AND (u.nome ILIKE $${params.push('%' + busca + '%')} OR u.email ILIKE $${params.push('%' + busca + '%')})`;

    const { rows } = await pool.query(
      `SELECT u.id, u.nome, u.email, u.telefone, u.ativo, u.xp, u.sequencia_atual, u.created_at,
              m.status as matricula_status, m.data_vencimento, p.nome as plano_nome
       FROM usuarios u
       LEFT JOIN matriculas m ON m.usuario_id = u.id AND m.status = 'ativa'
       LEFT JOIN planos p ON p.id = m.plano_id
       ${where}
       ORDER BY u.created_at DESC LIMIT $1 OFFSET $2`,
      params
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/admin/alunos/:id/toggle (ativar/desativar)
router.patch('/alunos/:id/toggle', authMiddleware, requireRole('admin', 'dono'), async (req, res, next) => {
  try {
    const { rows: [user] } = await pool.query(
      'UPDATE usuarios SET ativo = NOT ativo, updated_at = NOW() WHERE id = $1 RETURNING id, nome, ativo',
      [req.params.id]
    );
    if (!user) return res.status(404).json({ error: 'Aluno não encontrado' });
    res.json(user);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/admin/alunos/:id/senha (redefinir senha pelo admin)
router.patch('/alunos/:id/senha', authMiddleware, requireRole('admin', 'dono'), async (req, res, next) => {
  try {
    const { nova_senha } = req.body;
    if (!nova_senha || nova_senha.length < 6) {
      return res.status(400).json({ error: 'Senha deve ter no mínimo 6 caracteres' });
    }
    const bcrypt = require('bcryptjs');
    const senha_hash = await bcrypt.hash(nova_senha, 10);
    const agora = Math.floor(Date.now() / 1000);

    const { rows: [user] } = await pool.query(
      `UPDATE usuarios SET senha_hash = $1, senha_alterada_em = NOW(), reset_token_hash = NULL, reset_token_expira = NULL, updated_at = NOW()
       WHERE id = $2 AND role = 'aluno' RETURNING id, nome`,
      [senha_hash, req.params.id]
    );
    if (!user) return res.status(404).json({ error: 'Aluno não encontrado' });
    res.json({ ok: true, nome: user.nome });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
