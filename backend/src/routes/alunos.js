const express = require('express');
const pool = require('../config/db');
const { authMiddleware } = require('../middleware/authMiddleware');

const router = express.Router();

// GET /api/alunos/dashboard — dados completos da área do aluno
router.get('/dashboard', authMiddleware, async (req, res, next) => {
  try {
    const [userRow, freqMes, totalTreinos, conquistas] = await Promise.all([
      pool.query(
        `SELECT u.id, u.nome, u.email, u.foto_url, u.xp, u.sequencia_atual, u.maior_sequencia,
                m.status as matricula_status, m.data_vencimento, p.nome as plano_nome
         FROM usuarios u
         LEFT JOIN LATERAL (
           SELECT * FROM matriculas WHERE usuario_id = u.id ORDER BY created_at DESC LIMIT 1
         ) m ON true
         LEFT JOIN planos p ON p.id = m.plano_id
         WHERE u.id = $1`,
        [req.user.id]
      ),
      pool.query(
        `SELECT COUNT(*)::int AS dias_mes FROM frequencias
         WHERE usuario_id = $1 AND DATE_TRUNC('month', data) = DATE_TRUNC('month', NOW())`,
        [req.user.id]
      ),
      pool.query(
        'SELECT COUNT(*)::int AS total FROM frequencias WHERE usuario_id = $1',
        [req.user.id]
      ),
      pool.query(
        `SELECT c.nome, c.icone, ac.desbloqueada_em
         FROM aluno_conquistas ac JOIN conquistas c ON c.id = ac.conquista_id
         WHERE ac.usuario_id = $1 ORDER BY ac.desbloqueada_em DESC LIMIT 5`,
        [req.user.id]
      ),
    ]);

    res.json({
      ...userRow.rows[0],
      dias_treinados_mes: freqMes.rows[0].dias_mes,
      total_treinos: totalTreinos.rows[0].total,
      conquistas_recentes: conquistas.rows,
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/alunos/perfil — dados editáveis do próprio perfil
router.get('/perfil', authMiddleware, async (req, res, next) => {
  try {
    const { rows: [user] } = await pool.query(
      `SELECT u.id, u.nome, u.email, u.telefone, u.cpf, u.data_nascimento, u.foto_url,
              m.status as matricula_status, m.data_vencimento, p.nome as plano_nome
       FROM usuarios u
       LEFT JOIN LATERAL (
         SELECT * FROM matriculas WHERE usuario_id = u.id ORDER BY created_at DESC LIMIT 1
       ) m ON true
       LEFT JOIN planos p ON p.id = m.plano_id
       WHERE u.id = $1`,
      [req.user.id]
    );
    res.json(user);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/alunos/perfil
router.patch('/perfil', authMiddleware, async (req, res, next) => {
  try {
    const CAMPOS_PERMITIDOS = ['nome', 'telefone', 'foto_url', 'data_nascimento'];
    const updates = [];
    const values = [];
    for (const campo of CAMPOS_PERMITIDOS) {
      if (req.body[campo] !== undefined) {
        updates.push(`${campo} = $${values.push(req.body[campo])}`);
      }
    }
    if (!updates.length) return res.status(400).json({ error: 'Nenhum campo válido enviado' });

    values.push(req.user.id);
    const { rows: [user] } = await pool.query(
      `UPDATE usuarios SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${values.length} RETURNING id, nome, email, telefone, foto_url`,
      values
    );
    res.json(user);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
