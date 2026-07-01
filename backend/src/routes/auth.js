const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { authMiddleware } = require('../middleware/authMiddleware');

const router = express.Router();

function gerarLinkIndicacao() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 8 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function gerarToken(user) {
  const pwdTs = user.senha_alterada_em
    ? Math.floor(new Date(user.senha_alterada_em).getTime() / 1000)
    : 0;
  return jwt.sign({ id: user.id, role: user.role, pwdTs }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

// POST /api/auth/registro
router.post('/registro', async (req, res, next) => {
  try {
    const { nome, email, senha, telefone, cpf, data_nascimento, link_indicacao_origem } = req.body;

    if (!nome || !email || !senha) {
      return res.status(400).json({ error: 'nome, email e senha são obrigatórios' });
    }
    if (senha.length < 8 || !/[a-zA-Z]/.test(senha) || !/[0-9]/.test(senha)) {
      return res.status(400).json({ error: 'Senha deve ter no mínimo 8 caracteres com letra e número' });
    }

    const senha_hash = await bcrypt.hash(senha, 12);
    let link_indicacao = gerarLinkIndicacao();

    let indicador_id = null;
    if (link_indicacao_origem) {
      const { rows } = await pool.query(
        'SELECT id FROM usuarios WHERE link_indicacao = $1',
        [link_indicacao_origem]
      );
      if (rows[0]) indicador_id = rows[0].id;
    }

    const { rows } = await pool.query(
      `INSERT INTO usuarios (nome, email, senha_hash, telefone, cpf, data_nascimento, link_indicacao, indicado_por)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, nome, email, role, link_indicacao`,
      [nome, email, senha_hash, telefone, cpf, data_nascimento, link_indicacao, indicador_id]
    );
    const user = rows[0];

    if (indicador_id) {
      await pool.query(
        `INSERT INTO indicacoes (indicador_id) VALUES ($1)`,
        [indicador_id]
      );
    }

    res.status(201).json({ token: gerarToken(user), user });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/login
router.post('/login', async (req, res, next) => {
  try {
    const { email, senha } = req.body;
    if (!email || !senha) return res.status(400).json({ error: 'email e senha são obrigatórios' });

    const { rows } = await pool.query(
      'SELECT * FROM usuarios WHERE email = $1 AND ativo = TRUE',
      [email]
    );
    const user = rows[0];
    if (!user || !(await bcrypt.compare(senha, user.senha_hash))) {
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    res.json({ token: gerarToken(user), user: { id: user.id, nome: user.nome, email: user.email, role: user.role } });
  } catch (err) {
    next(err);
  }
});

// GET /api/auth/me
router.get('/me', authMiddleware, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT u.id, u.nome, u.email, u.telefone, u.foto_url, u.role, u.xp,
            u.sequencia_atual, u.maior_sequencia, u.link_indicacao,
            m.status as matricula_status, m.data_vencimento, p.nome as plano_nome
     FROM usuarios u
     LEFT JOIN matriculas m ON m.usuario_id = u.id AND m.status = 'ativa'
     LEFT JOIN planos p ON p.id = m.plano_id
     WHERE u.id = $1`,
    [req.user.id]
  );
  res.json(rows[0]);
});

// POST /api/auth/logout-everywhere
router.post('/logout-everywhere', authMiddleware, async (req, res, next) => {
  try {
    await pool.query(
      'UPDATE usuarios SET senha_alterada_em = NOW() WHERE id = $1',
      [req.user.id]
    );
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
