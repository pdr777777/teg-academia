const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const pool = require('../config/db');

function unico() {
  return crypto.randomUUID();
}

async function criarUsuario(overrides = {}) {
  const senha_hash = await bcrypt.hash('senha1234', 4);
  const { rows: [user] } = await pool.query(
    `INSERT INTO usuarios (nome, email, senha_hash, telefone, role)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [
      overrides.nome || 'Aluno Teste',
      overrides.email || `${unico()}@teste.com`,
      senha_hash,
      overrides.telefone || '67999999999',
      overrides.role || 'aluno',
    ]
  );
  return user;
}

async function criarPlano(overrides = {}) {
  const { rows: [plano] } = await pool.query(
    `INSERT INTO planos (nome, descricao, preco_mensal, duracao_dias)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [
      overrides.nome || `Plano Teste ${unico()}`,
      overrides.descricao || 'Plano de teste',
      overrides.preco_mensal || 109.9,
      overrides.duracao_dias || 30,
    ]
  );
  return plano;
}

async function criarMatricula(overrides) {
  const { rows: [matricula] } = await pool.query(
    `INSERT INTO matriculas (usuario_id, plano_id, data_vencimento, status)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [
      overrides.usuario_id,
      overrides.plano_id,
      overrides.data_vencimento || new Date(Date.now() + 30 * 86400000),
      overrides.status || 'ativa',
    ]
  );
  return matricula;
}

function gerarToken(user) {
  const pwdTs = user.senha_alterada_em
    ? Math.floor(new Date(user.senha_alterada_em).getTime() / 1000)
    : 0;
  return jwt.sign({ id: user.id, role: user.role, pwdTs }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

module.exports = { criarUsuario, criarPlano, criarMatricula, gerarToken };
