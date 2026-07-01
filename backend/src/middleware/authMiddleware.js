const jwt = require('jsonwebtoken');
const pool = require('../config/db');

async function authMiddleware(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Token não fornecido' });
  }

  const token = header.split(' ')[1];
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ error: 'Token inválido ou expirado' });
  }

  const { rows } = await pool.query(
    'SELECT id, nome, email, role, ativo, senha_alterada_em FROM usuarios WHERE id = $1',
    [payload.id]
  );
  const user = rows[0];

  if (!user || !user.ativo) {
    return res.status(401).json({ error: 'Usuário inativo ou não encontrado' });
  }

  const pwdTs = user.senha_alterada_em
    ? Math.floor(new Date(user.senha_alterada_em).getTime() / 1000)
    : 0;
  if (payload.pwdTs !== pwdTs) {
    return res.status(401).json({ error: 'Sessão encerrada. Faça login novamente.' });
  }

  req.user = user;
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Acesso negado' });
    }
    next();
  };
}

module.exports = { authMiddleware, requireRole };
