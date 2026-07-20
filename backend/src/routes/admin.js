const express = require('express');
const pool = require('../config/db');
const { authMiddleware, requireRole } = require('../middleware/authMiddleware');
const xpService = require('../services/xpService');

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

// GET /api/admin/financeiro — dashboard financeiro do dono
router.get('/financeiro', authMiddleware, requireRole('dono'), async (req, res, next) => {
  try {
    const [ativos, faturamentoMes, faturamentoMesAnterior, inadimplentes, novos, config, inadimplentesDetalhe] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS total FROM matriculas WHERE status = 'ativa'`),
      pool.query(`SELECT COALESCE(SUM(valor), 0)::numeric AS total FROM pagamentos WHERE status = 'pago' AND DATE_TRUNC('month', data_pagamento) = DATE_TRUNC('month', NOW())`),
      pool.query(`SELECT COALESCE(SUM(valor), 0)::numeric AS total FROM pagamentos WHERE status = 'pago' AND DATE_TRUNC('month', data_pagamento) = DATE_TRUNC('month', NOW() - INTERVAL '1 month')`),
      pool.query(`SELECT COUNT(*)::int AS total FROM matriculas WHERE status IN ('vencida', 'suspensa')`),
      pool.query(`SELECT COUNT(*)::int AS total FROM usuarios WHERE role = 'aluno' AND DATE_TRUNC('month', created_at) = DATE_TRUNC('month', NOW())`),
      pool.query(`SELECT * FROM configuracoes WHERE id = 1`),
      pool.query(`
        SELECT u.id AS usuario_id, u.nome, u.telefone, m.status AS matricula_status, m.data_vencimento,
               (CURRENT_DATE - m.data_vencimento::date)::int AS dias_atraso
        FROM matriculas m JOIN usuarios u ON u.id = m.usuario_id
        WHERE m.status IN ('vencida', 'suspensa')
        ORDER BY m.data_vencimento ASC
      `),
    ]);

    const { rows: ticketRow } = await pool.query(
      `SELECT COALESCE(AVG(p.valor), 0)::numeric AS ticket_medio FROM pagamentos p WHERE p.status = 'pago'`
    );

    const { rows: grafico } = await pool.query(
      `SELECT TO_CHAR(data_pagamento, 'YYYY-MM') AS mes, SUM(valor)::numeric AS faturamento
       FROM pagamentos WHERE status = 'pago' AND data_pagamento >= NOW() - INTERVAL '6 months'
       GROUP BY mes ORDER BY mes`
    );

    const { rows: distribuicaoPlanos } = await pool.query(
      `SELECT p.nome, COUNT(m.id)::int AS total
       FROM matriculas m JOIN planos p ON p.id = m.plano_id
       WHERE m.status = 'ativa' GROUP BY p.nome ORDER BY total DESC`
    );

    const { rows: transacoesRecentes } = await pool.query(
      `SELECT pg.id, pg.valor, pg.status, pg.metodo, pg.data_pagamento, pg.created_at, u.nome AS aluno_nome
       FROM pagamentos pg JOIN usuarios u ON u.id = pg.usuario_id
       ORDER BY pg.created_at DESC LIMIT 8`
    );

    const cfg = config.rows[0];
    const faturamento_mes = Number(faturamentoMes.rows[0].total);
    const faturamento_mes_anterior = Number(faturamentoMesAnterior.rows[0].total);
    const novos_mes = novos.rows[0].total;

    const clamp = (n) => Math.max(0, Math.min(100, n));
    const variacao_faturamento_pct = faturamento_mes_anterior > 0
      ? ((faturamento_mes - faturamento_mes_anterior) / faturamento_mes_anterior) * 100
      : null;

    res.json({
      alunos_ativos: ativos.rows[0].total,
      faturamento_mes,
      faturamento_mes_anterior,
      variacao_faturamento_pct,
      inadimplentes: inadimplentes.rows[0].total,
      novos_mes,
      ticket_medio: ticketRow[0].ticket_medio,
      grafico_faturamento: grafico,
      distribuicao_planos: distribuicaoPlanos,
      transacoes_recentes: transacoesRecentes,
      metas: {
        nome_academia: cfg.nome_academia,
        meta_faturamento_mensal: Number(cfg.meta_faturamento_mensal),
        meta_novos_alunos_mensal: cfg.meta_novos_alunos_mensal,
        progresso_faturamento_pct: cfg.meta_faturamento_mensal > 0
          ? clamp((faturamento_mes / Number(cfg.meta_faturamento_mensal)) * 100)
          : 0,
        progresso_novos_alunos_pct: cfg.meta_novos_alunos_mensal > 0
          ? clamp((novos_mes / cfg.meta_novos_alunos_mensal) * 100)
          : 0,
      },
      dias_tolerancia_bloqueio: cfg.dias_tolerancia_bloqueio,
      inadimplentes_detalhe: inadimplentesDetalhe.rows,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/admin/alunos — admin/dono usam pra gestão completa, professor usa só pra buscar aluno e atribuir treino
router.get('/alunos', authMiddleware, requireRole('admin', 'dono', 'professor'), async (req, res, next) => {
  try {
    const { busca, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;
    const params = [limit, offset];
    let where = "WHERE u.role = 'aluno'";
    if (busca) where += ` AND (u.nome ILIKE $${params.push('%' + busca + '%')} OR u.email ILIKE $${params.push('%' + busca + '%')})`;

    const { rows } = await pool.query(
      `SELECT u.id, u.nome, u.email, u.telefone, u.ativo, u.xp, u.sequencia_atual, u.created_at, u.controlid_user_id, u.origem_externa,
              m.id as matricula_id, m.status as matricula_status, m.data_vencimento, p.nome as plano_nome
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

// PATCH /api/admin/alunos/:id/catraca (vincula/desvincula o ID do aluno no Control iD da catraca)
router.patch('/alunos/:id/catraca', authMiddleware, requireRole('admin', 'dono'), async (req, res, next) => {
  try {
    const { controlid_user_id } = req.body;
    const valor = controlid_user_id ? String(controlid_user_id).trim() : null;

    const { rows: [user] } = await pool.query(
      `UPDATE usuarios SET controlid_user_id = $1, updated_at = NOW()
       WHERE id = $2 AND role = 'aluno' RETURNING id, nome, controlid_user_id`,
      [valor, req.params.id]
    );
    if (!user) return res.status(404).json({ error: 'Aluno não encontrado' });
    res.json(user);
  } catch (err) {
    if (err.code === '23505') {
      return res.status(409).json({ error: 'Esse ID do Control iD já está vinculado a outro aluno' });
    }
    next(err);
  }
});

// GET /api/admin/planos — todos os planos incluindo inativos
router.get('/planos', authMiddleware, requireRole('admin', 'dono'), async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT p.*, COUNT(m.id) FILTER (WHERE m.status = 'ativa')::int AS alunos_ativos
       FROM planos p
       LEFT JOIN matriculas m ON m.plano_id = p.id
       GROUP BY p.id ORDER BY p.preco_mensal`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// POST /api/admin/matriculas — admin matricula um aluno manualmente
router.post('/matriculas', authMiddleware, requireRole('admin', 'dono'), async (req, res, next) => {
  try {
    const { usuario_id, plano_id, metodo_pagamento } = req.body;
    if (!usuario_id || !plano_id) return res.status(400).json({ error: 'usuario_id e plano_id são obrigatórios' });

    const { rows: [plano] } = await pool.query('SELECT * FROM planos WHERE id = $1 AND ativo = TRUE', [plano_id]);
    if (!plano) return res.status(404).json({ error: 'Plano não encontrado' });

    const { rows: [aluno] } = await pool.query("SELECT id, nome FROM usuarios WHERE id = $1 AND role = 'aluno'", [usuario_id]);
    if (!aluno) return res.status(404).json({ error: 'Aluno não encontrado' });

    const data_vencimento = new Date();
    data_vencimento.setDate(data_vencimento.getDate() + plano.duracao_dias);

    // Pago na hora → ativa; sem método → suspensa até confirmar pagamento
    const statusMatricula = metodo_pagamento ? 'ativa' : 'suspensa';
    const statusPagamento = metodo_pagamento ? 'pago' : 'pendente';

    const { rows: [matricula] } = await pool.query(
      `INSERT INTO matriculas (usuario_id, plano_id, data_vencimento, status)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [usuario_id, plano_id, data_vencimento, statusMatricula]
    );

    await pool.query(
      `INSERT INTO pagamentos (matricula_id, usuario_id, valor, status, metodo, data_pagamento)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [matricula.id, usuario_id, plano.preco_mensal, statusPagamento,
       metodo_pagamento || null, metodo_pagamento ? new Date() : null]
    );

    if (statusMatricula === 'ativa') {
      await xpService.adicionarXP(usuario_id, 100, 'matricula');
      const { rows: [indicacao] } = await pool.query(
        `UPDATE indicacoes SET status = 'convertido', convertido_em = NOW()
         WHERE indicado_id = $1 AND status = 'pendente'
         RETURNING indicador_id`,
        [usuario_id]
      );
      if (indicacao) {
        await xpService.adicionarXP(indicacao.indicador_id, 200, 'indicacao');
      }
    }

    res.status(201).json({ ...matricula, plano_nome: plano.nome, aluno_nome: aluno.nome });
  } catch (err) {
    next(err);
  }
});

// PATCH /api/admin/matriculas/:id/renovar — renova/estende matrícula existente
router.patch('/matriculas/:id/renovar', authMiddleware, requireRole('admin', 'dono'), async (req, res, next) => {
  try {
    const { plano_id, metodo_pagamento } = req.body;

    const { rows: [matricula] } = await pool.query(
      'SELECT * FROM matriculas WHERE id = $1',
      [req.params.id]
    );
    if (!matricula) return res.status(404).json({ error: 'Matrícula não encontrada' });

    const planId = plano_id || matricula.plano_id;
    const { rows: [plano] } = await pool.query('SELECT * FROM planos WHERE id = $1 AND ativo = TRUE', [planId]);
    if (!plano) return res.status(404).json({ error: 'Plano não encontrado' });

    // Vencimento parte da data atual ou do vencimento atual (o que for maior)
    const base = new Date(Math.max(new Date(), new Date(matricula.data_vencimento)));
    const nova_vencimento = new Date(base);
    nova_vencimento.setDate(nova_vencimento.getDate() + plano.duracao_dias);

    const { rows: [atualizada] } = await pool.query(
      `UPDATE matriculas SET plano_id = $1, data_vencimento = $2, status = 'ativa', updated_at = NOW()
       WHERE id = $3 RETURNING *`,
      [planId, nova_vencimento, req.params.id]
    );

    const statusPagamento = metodo_pagamento ? 'pago' : 'pendente';
    await pool.query(
      `INSERT INTO pagamentos (matricula_id, usuario_id, valor, status, metodo, data_pagamento)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [matricula.id, matricula.usuario_id, plano.preco_mensal, statusPagamento,
       metodo_pagamento || null, metodo_pagamento ? new Date() : null]
    );

    res.json({ ...atualizada, plano_nome: plano.nome });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
