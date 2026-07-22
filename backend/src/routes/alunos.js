const express = require('express');
const multer = require('multer');
const pool = require('../config/db');
const { authMiddleware } = require('../middleware/authMiddleware');
const supabaseStorageService = require('../services/supabaseStorageService');
const { telefoneValido } = require('../utils/validacao');

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) {
      return cb(new Error('Formato de imagem não suportado (use JPEG, PNG ou WEBP)'));
    }
    cb(null, true);
  },
});

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
      `SELECT u.id, u.nome, u.email, u.telefone, u.cpf, u.apelido, u.data_nascimento, u.foto_url, u.notificacoes_whatsapp,
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
    if (req.body.telefone && !telefoneValido(req.body.telefone)) {
      return res.status(400).json({ error: 'Telefone inválido' });
    }

    const CAMPOS_PERMITIDOS = ['nome', 'telefone', 'foto_url', 'data_nascimento', 'notificacoes_whatsapp', 'apelido'];
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
      `UPDATE usuarios SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${values.length} RETURNING id, nome, email, telefone, foto_url, apelido, notificacoes_whatsapp`,
      values
    );
    res.json(user);
  } catch (err) {
    next(err);
  }
});

// POST /api/alunos/perfil/foto — upload da foto de perfil (Supabase Storage)
router.post('/perfil/foto', authMiddleware, (req, res, next) => {
  upload.single('foto')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'Nenhum arquivo enviado' });

    try {
      const foto_url = await supabaseStorageService.uploadFotoPerfil(req.user.id, req.file.buffer, req.file.mimetype);
      await pool.query('UPDATE usuarios SET foto_url = $1, updated_at = NOW() WHERE id = $2', [foto_url, req.user.id]);
      res.json({ foto_url });
    } catch (uploadErr) {
      next(uploadErr);
    }
  });
});

module.exports = router;
