const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const pool = require('../config/db');
const { authMiddleware } = require('../middleware/authMiddleware');
const whatsappService = require('../services/whatsappService');
const { emailValido, telefoneValido, cpfValido } = require('../utils/validacao');

const router = express.Router();

const MAX_TENTATIVAS_LOGIN = 5;
const BLOQUEIO_LOGIN_MINUTOS = 10;

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
    const { nome, email, senha, telefone, cpf, data_nascimento, link_indicacao_origem, plano_id } = req.body;

    if (!nome || !nome.trim() || !email || !senha) {
      return res.status(400).json({ error: 'nome, email e senha são obrigatórios' });
    }
    if (senha.length < 8 || !/[a-zA-Z]/.test(senha) || !/[0-9]/.test(senha)) {
      return res.status(400).json({ error: 'Senha deve ter no mínimo 8 caracteres com letra e número' });
    }
    if (!emailValido(email)) {
      return res.status(400).json({ error: 'E-mail inválido' });
    }
    if (telefone && !telefoneValido(telefone)) {
      return res.status(400).json({ error: 'Telefone inválido' });
    }
    if (cpf && !cpfValido(cpf)) {
      return res.status(400).json({ error: 'CPF inválido' });
    }

    // Valida o plano antes de criar qualquer coisa — evita usuário órfão sem
    // matrícula se o plano_id vier inválido/inativo.
    let plano = null;
    if (plano_id) {
      const { rows: [p] } = await pool.query('SELECT * FROM planos WHERE id = $1 AND ativo = TRUE', [plano_id]);
      if (!p) return res.status(404).json({ error: 'Plano não encontrado' });
      plano = p;
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
        `INSERT INTO indicacoes (indicador_id, indicado_id) VALUES ($1, $2)`,
        [indicador_id, user.id]
      );
    }

    // Matrícula de auto-cadastro nasce "suspensa" + pagamento "pendente" —
    // mesmo estado que o admin usa quando adiciona aluno sem pagamento na
    // hora (POST /api/admin/matriculas). Só vira "ativa" quando alguém
    // confirmar o pagamento em PATCH /api/pagamentos/:id/confirmar; até lá
    // não conta como aluno ativo em nenhuma métrica.
    let matricula = null;
    if (plano) {
      const data_vencimento = new Date();
      data_vencimento.setDate(data_vencimento.getDate() + plano.duracao_dias);

      const { rows: [novaMatricula] } = await pool.query(
        `INSERT INTO matriculas (usuario_id, plano_id, data_vencimento, status)
         VALUES ($1, $2, $3, 'suspensa') RETURNING *`,
        [user.id, plano.id, data_vencimento]
      );
      matricula = novaMatricula;

      await pool.query(
        `INSERT INTO pagamentos (matricula_id, usuario_id, valor, status)
         VALUES ($1, $2, $3, 'pendente')`,
        [matricula.id, user.id, plano.preco_mensal]
      );
    }

    res.status(201).json({ token: gerarToken(user), user, matricula });
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

    if (user && user.bloqueado_ate && new Date(user.bloqueado_ate) > new Date()) {
      const minutosRestantes = Math.max(1, Math.ceil((new Date(user.bloqueado_ate) - new Date()) / 60000));
      return res.status(429).json({
        error: `Muitas tentativas erradas. Tente novamente em ${minutosRestantes} minuto(s) ou redefina sua senha.`,
        bloqueado: true,
        bloqueado_ate: user.bloqueado_ate,
      });
    }

    const senhaValida = user && (await bcrypt.compare(senha, user.senha_hash));

    if (!senhaValida) {
      if (user) {
        const tentativas = user.tentativas_login_falhas + 1;
        if (tentativas >= MAX_TENTATIVAS_LOGIN) {
          const bloqueadoAte = new Date(Date.now() + BLOQUEIO_LOGIN_MINUTOS * 60000);
          await pool.query(
            'UPDATE usuarios SET tentativas_login_falhas = 0, bloqueado_ate = $1 WHERE id = $2',
            [bloqueadoAte, user.id]
          );
          return res.status(429).json({
            error: `Muitas tentativas erradas. Sua conta foi bloqueada por ${BLOQUEIO_LOGIN_MINUTOS} minutos. Redefina sua senha ou tente novamente depois.`,
            bloqueado: true,
            bloqueado_ate: bloqueadoAte,
          });
        }
        await pool.query('UPDATE usuarios SET tentativas_login_falhas = $1 WHERE id = $2', [tentativas, user.id]);
      }
      return res.status(401).json({ error: 'Credenciais inválidas' });
    }

    if (user.tentativas_login_falhas > 0 || user.bloqueado_ate) {
      await pool.query('UPDATE usuarios SET tentativas_login_falhas = 0, bloqueado_ate = NULL WHERE id = $1', [user.id]);
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

// PATCH /api/auth/senha (autoatendimento — troca a própria senha)
router.patch('/senha', authMiddleware, async (req, res, next) => {
  try {
    const { senha_atual, nova_senha } = req.body;
    if (!senha_atual || !nova_senha) {
      return res.status(400).json({ error: 'senha_atual e nova_senha são obrigatórios' });
    }
    if (nova_senha.length < 8 || !/[a-zA-Z]/.test(nova_senha) || !/[0-9]/.test(nova_senha)) {
      return res.status(400).json({ error: 'Senha deve ter no mínimo 8 caracteres com letra e número' });
    }

    const { rows } = await pool.query('SELECT senha_hash FROM usuarios WHERE id = $1', [req.user.id]);
    const senhaValida = rows[0] && (await bcrypt.compare(senha_atual, rows[0].senha_hash));
    if (!senhaValida) return res.status(401).json({ error: 'Senha atual incorreta' });

    const senha_hash = await bcrypt.hash(nova_senha, 12);
    await pool.query(
      'UPDATE usuarios SET senha_hash = $1, senha_alterada_em = NOW() WHERE id = $2',
      [senha_hash, req.user.id]
    );

    res.json({ token: gerarToken({ ...req.user, senha_alterada_em: new Date() }) });
  } catch (err) {
    next(err);
  }
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

// POST /api/auth/esqueci-senha
router.post('/esqueci-senha', async (req, res, next) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: 'email é obrigatório' });

    const { rows } = await pool.query(
      'SELECT id, nome, telefone FROM usuarios WHERE email = $1 AND ativo = TRUE',
      [email]
    );
    const user = rows[0];

    if (user) {
      const token = crypto.randomBytes(32).toString('hex');
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const expiraEm = new Date(Date.now() + 60 * 60 * 1000);

      await pool.query(
        'UPDATE usuarios SET reset_token_hash = $1, reset_token_expira = $2 WHERE id = $3',
        [tokenHash, expiraEm, user.id]
      );

      const linkReset = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/redefinir-senha.html?token=${token}`;
      if (user.telefone) {
        await whatsappService.enviar(
          user.telefone,
          `Olá ${user.nome}! Recebemos um pedido para redefinir sua senha.\n` +
          `Clique no link abaixo (válido por 1 hora):\n${linkReset}\n\n` +
          `Se não foi você, ignore esta mensagem.`
        );
      }
    }

    res.json({ mensagem: 'Se o e-mail existir, enviaremos um link de redefinição pelo WhatsApp cadastrado.' });
  } catch (err) {
    next(err);
  }
});

// POST /api/auth/redefinir-senha
router.post('/redefinir-senha', async (req, res, next) => {
  try {
    const { token, novaSenha } = req.body;
    if (!token || !novaSenha) {
      return res.status(400).json({ error: 'token e novaSenha são obrigatórios' });
    }
    if (novaSenha.length < 8 || !/[a-zA-Z]/.test(novaSenha) || !/[0-9]/.test(novaSenha)) {
      return res.status(400).json({ error: 'Senha deve ter no mínimo 8 caracteres com letra e número' });
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const { rows } = await pool.query(
      'SELECT id FROM usuarios WHERE reset_token_hash = $1 AND reset_token_expira > NOW()',
      [tokenHash]
    );
    const user = rows[0];
    if (!user) {
      return res.status(400).json({ error: 'Token inválido ou expirado' });
    }

    const senha_hash = await bcrypt.hash(novaSenha, 12);
    await pool.query(
      `UPDATE usuarios
       SET senha_hash = $1, senha_alterada_em = NOW(), reset_token_hash = NULL, reset_token_expira = NULL,
           tentativas_login_falhas = 0, bloqueado_ate = NULL
       WHERE id = $2`,
      [senha_hash, user.id]
    );

    res.json({ mensagem: 'Senha redefinida com sucesso.' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
