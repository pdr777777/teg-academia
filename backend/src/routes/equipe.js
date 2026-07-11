const express = require('express');
const bcrypt = require('bcryptjs');
const pool = require('../config/db');
const { authMiddleware, requireRole } = require('../middleware/authMiddleware');

const router = express.Router();
const ROLES_EQUIPE = ['admin', 'professor'];

router.use(authMiddleware, requireRole('dono'));

// GET /api/equipe
router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `SELECT id, nome, email, telefone, role, ativo, created_at
       FROM usuarios WHERE role IN ('admin', 'professor') ORDER BY created_at DESC`
    );
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// POST /api/equipe
router.post('/', async (req, res, next) => {
  try {
    const { nome, email, senha, role, telefone } = req.body;
    if (!nome || !email || !senha || !role) {
      return res.status(400).json({ error: 'nome, email, senha e role são obrigatórios' });
    }
    if (!ROLES_EQUIPE.includes(role)) {
      return res.status(400).json({ error: "role deve ser 'admin' ou 'professor'" });
    }
    if (senha.length < 8 || !/[a-zA-Z]/.test(senha) || !/[0-9]/.test(senha)) {
      return res.status(400).json({ error: 'Senha deve ter no mínimo 8 caracteres com letra e número' });
    }

    const senha_hash = await bcrypt.hash(senha, 12);
    const { rows } = await pool.query(
      `INSERT INTO usuarios (nome, email, senha_hash, telefone, role)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, nome, email, telefone, role, ativo, created_at`,
      [nome, email, senha_hash, telefone || null, role]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/equipe/:id/toggle
router.patch('/:id/toggle', async (req, res, next) => {
  try {
    const { rows } = await pool.query(
      `UPDATE usuarios SET ativo = NOT ativo, updated_at = NOW()
       WHERE id = $1 AND role IN ('admin', 'professor') RETURNING id, nome, ativo`,
      [req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Membro da equipe não encontrado' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// PATCH /api/equipe/:id/senha
router.patch('/:id/senha', async (req, res, next) => {
  try {
    const { nova_senha } = req.body;
    if (!nova_senha || nova_senha.length < 6) {
      return res.status(400).json({ error: 'Senha deve ter no mínimo 6 caracteres' });
    }
    const senha_hash = await bcrypt.hash(nova_senha, 12);
    const { rows } = await pool.query(
      `UPDATE usuarios SET senha_hash = $1, senha_alterada_em = NOW(), updated_at = NOW()
       WHERE id = $2 AND role IN ('admin', 'professor') RETURNING id, nome`,
      [senha_hash, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Membro da equipe não encontrado' });
    res.json({ ok: true, nome: rows[0].nome });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
