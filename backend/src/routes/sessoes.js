const express = require('express');
const pool = require('../config/db');
const { authMiddleware } = require('../middleware/authMiddleware');
const xpService = require('../services/xpService');

const router = express.Router();

async function treinoAtivoDoAluno(usuario_id) {
  const { rows: [treino] } = await pool.query(
    `SELECT t.id FROM treino_alunos ta JOIN treinos t ON t.id = ta.treino_id
     WHERE ta.usuario_id = $1 AND ta.ativo = TRUE LIMIT 1`,
    [usuario_id]
  );
  return treino?.id || null;
}

async function iniciarSessao(usuario_id, treino_id, origem) {
  const treinoId = treino_id || await treinoAtivoDoAluno(usuario_id);
  if (!treinoId) {
    const err = new Error('Aluno não tem treino atribuído');
    err.status = 400;
    throw err;
  }

  try {
    const { rows: [sessao] } = await pool.query(
      `INSERT INTO treino_sessoes (usuario_id, treino_id, origem) VALUES ($1, $2, $3) RETURNING *`,
      [usuario_id, treinoId, origem]
    );
    return sessao;
  } catch (err) {
    if (err.code === '23505') {
      // já existe sessão em andamento — devolve ela em vez de duplicar
      const { rows: [existente] } = await pool.query(
        `SELECT * FROM treino_sessoes WHERE usuario_id = $1 AND status = 'em_andamento'`,
        [usuario_id]
      );
      return existente;
    }
    throw err;
  }
}

// POST /api/sessoes/iniciar — aluno aperta "Iniciar treino" no app
router.post('/iniciar', authMiddleware, async (req, res, next) => {
  try {
    const sessao = await iniciarSessao(req.user.id, req.body.treino_id, 'manual');
    res.status(201).json(sessao);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

// GET /api/sessoes/atual — sessão em andamento do aluno (pra retomar o treino ao reabrir o app)
router.get('/atual', authMiddleware, async (req, res, next) => {
  try {
    const { rows: [sessao] } = await pool.query(
      `SELECT * FROM treino_sessoes WHERE usuario_id = $1 AND status = 'em_andamento'`,
      [req.user.id]
    );
    if (!sessao) return res.json(null);

    const { rows: series } = await pool.query(
      `SELECT treino_exercicio_id, numero_serie, repeticoes_realizadas, carga_realizada
       FROM treino_sessao_series WHERE sessao_id = $1 ORDER BY concluida_em`,
      [sessao.id]
    );
    res.json({ ...sessao, series_registradas: series });
  } catch (err) {
    next(err);
  }
});

// POST /api/sessoes/:id/serie — registra uma série concluída (carga/reps reais)
router.post('/:id/serie', authMiddleware, async (req, res, next) => {
  try {
    const { treino_exercicio_id, numero_serie, repeticoes_realizadas, carga_realizada } = req.body;

    const { rows: [sessao] } = await pool.query(
      `SELECT ts.id, ts.treino_id FROM treino_sessoes ts
       WHERE ts.id = $1 AND ts.usuario_id = $2 AND ts.status = 'em_andamento'`,
      [req.params.id, req.user.id]
    );
    if (!sessao) return res.status(404).json({ error: 'Sessão não encontrada ou já finalizada' });

    const { rows: [exercicio] } = await pool.query(
      'SELECT id FROM treino_exercicios WHERE id = $1 AND treino_id = $2',
      [treino_exercicio_id, sessao.treino_id]
    );
    if (!exercicio) return res.status(400).json({ error: 'Exercício não pertence a este treino' });

    const { rows: [serie] } = await pool.query(
      `INSERT INTO treino_sessao_series (sessao_id, treino_exercicio_id, numero_serie, repeticoes_realizadas, carga_realizada)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [sessao.id, treino_exercicio_id, numero_serie, repeticoes_realizadas || null, carga_realizada || null]
    );
    res.status(201).json(serie);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/sessoes/:id/finalizar — encerra a sessão, conta check-in do dia e dá XP
router.patch('/:id/finalizar', authMiddleware, async (req, res, next) => {
  try {
    const { rows: [sessao] } = await pool.query(
      `SELECT * FROM treino_sessoes WHERE id = $1 AND usuario_id = $2 AND status = 'em_andamento'`,
      [req.params.id, req.user.id]
    );
    if (!sessao) return res.status(404).json({ error: 'Sessão não encontrada ou já finalizada' });

    const { rows: [atualizada] } = await pool.query(
      `UPDATE treino_sessoes SET status = 'finalizada', finalizado_em = NOW(),
       duracao_segundos = EXTRACT(EPOCH FROM (NOW() - iniciado_em))::int
       WHERE id = $1 RETURNING *`,
      [sessao.id]
    );

    let xp_ganho = 0;

    // Check-in do dia (mesma regra do POST /api/frequencias/checkin) — só uma vez por dia
    const hoje = new Date().toISOString().split('T')[0];
    const { rows: jaTreinouHoje } = await pool.query(
      'SELECT id FROM frequencias WHERE usuario_id = $1 AND data = $2',
      [req.user.id, hoje]
    );
    if (!jaTreinouHoje[0]) {
      await pool.query('INSERT INTO frequencias (usuario_id, data) VALUES ($1, $2)', [req.user.id, hoje]);
      await xpService.adicionarXP(req.user.id, xpService.XP_POR_MOTIVO.treino, 'treino');
      await xpService.atualizarSequencia(req.user.id);
      xp_ganho += xpService.XP_POR_MOTIVO.treino;
    }

    // Bônus por registrar a sessão de verdade (série a série)
    const { rows: [{ total: seriesCount }] } = await pool.query(
      'SELECT COUNT(*)::int AS total FROM treino_sessao_series WHERE sessao_id = $1',
      [sessao.id]
    );
    const bonus = Math.min(seriesCount * xpService.XP_POR_SERIE_REGISTRADA, xpService.XP_BONUS_SESSAO_MAXIMO);
    if (bonus > 0) {
      await xpService.adicionarXP(req.user.id, bonus, 'sessao_treino');
      xp_ganho += bonus;
    }

    res.json({ ...atualizada, xp_ganho, series_registradas: seriesCount });
  } catch (err) {
    next(err);
  }
});

// POST /api/sessoes/catraca-checkin — webhook da catraca (reconhecimento facial).
// Não usa JWT (o dispositivo não tem sessão de aluno) — protegido por segredo compartilhado.
router.post('/catraca-checkin', async (req, res, next) => {
  try {
    if (req.headers['x-catraca-secret'] !== process.env.CATRACA_WEBHOOK_SECRET) {
      return res.status(401).json({ error: 'Não autorizado' });
    }

    const { usuario_id, cpf } = req.body;
    let usuarioId = usuario_id;
    if (!usuarioId && cpf) {
      const { rows: [user] } = await pool.query('SELECT id FROM usuarios WHERE cpf = $1', [cpf]);
      usuarioId = user?.id;
    }
    if (!usuarioId) return res.status(404).json({ error: 'Aluno não identificado' });

    const sessao = await iniciarSessao(usuarioId, null, 'catraca');
    res.status(201).json(sessao);
  } catch (err) {
    if (err.status) return res.status(err.status).json({ error: err.message });
    next(err);
  }
});

module.exports = router;
module.exports.iniciarSessao = iniciarSessao;
