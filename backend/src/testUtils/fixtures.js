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
    `INSERT INTO usuarios (nome, email, senha_hash, telefone, role, link_indicacao, notificacoes_whatsapp)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [
      overrides.nome || 'Aluno Teste',
      overrides.email || `${unico()}@teste.com`,
      senha_hash,
      overrides.telefone || '67999999999',
      overrides.role || 'aluno',
      overrides.link_indicacao || unico().slice(0, 8),
      overrides.notificacoes_whatsapp ?? true,
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
  // data_inicio precisa ser sempre anterior a data_vencimento (chk_matriculas_datas,
  // migration 016). Derivamos de data_vencimento em vez de confiar no DEFAULT NOW()
  // da coluna, senão matrículas com vencimento hoje/passado (comuns em testes de
  // jobWorker) violam a constraint.
  const dataVencimento = overrides.data_vencimento || new Date(Date.now() + 30 * 86400000);
  const dataInicio = overrides.data_inicio || new Date(new Date(dataVencimento).getTime() - 30 * 86400000);

  const { rows: [matricula] } = await pool.query(
    `INSERT INTO matriculas (usuario_id, plano_id, data_inicio, data_vencimento, status)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [
      overrides.usuario_id,
      overrides.plano_id,
      dataInicio,
      dataVencimento,
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

async function criarAula(overrides = {}) {
  const { rows: [aula] } = await pool.query(
    `INSERT INTO aulas (nome, professor_id, dia_semana, hora_inicio, hora_fim, capacidade_maxima, ativo)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [
      overrides.nome || `Aula Teste ${unico()}`,
      overrides.professor_id || null,
      overrides.dia_semana ?? 1,
      overrides.hora_inicio || '06:00',
      overrides.hora_fim || '07:00',
      overrides.capacidade_maxima || 20,
      overrides.ativo ?? true,
    ]
  );
  return aula;
}

async function criarExercicio(overrides = {}) {
  const { rows: [exercicio] } = await pool.query(
    `INSERT INTO exercicios (nome, video_url, grupo_muscular, descricao)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [
      overrides.nome || `Exercicio Teste ${unico()}`,
      overrides.video_url || null,
      overrides.grupo_muscular || 'peito',
      overrides.descricao || null,
    ]
  );
  return exercicio;
}

async function criarTreino(overrides = {}) {
  const { rows: [treino] } = await pool.query(
    `INSERT INTO treinos (nome, descricao, professor_id) VALUES ($1, $2, $3) RETURNING *`,
    [
      overrides.nome || `Treino Teste ${unico()}`,
      overrides.descricao || null,
      overrides.professor_id || null,
    ]
  );
  return treino;
}

async function criarTreinoExercicio(overrides) {
  const { rows: [treinoExercicio] } = await pool.query(
    `INSERT INTO treino_exercicios (treino_id, exercicio_id, series, repeticoes, carga, descanso_segundos, ordem, observacoes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
    [
      overrides.treino_id,
      overrides.exercicio_id,
      overrides.series ?? 3,
      overrides.repeticoes || '12',
      overrides.carga || null,
      overrides.descanso_segundos ?? 60,
      overrides.ordem ?? 0,
      overrides.observacoes || null,
    ]
  );
  return treinoExercicio;
}

async function atribuirTreino(treino_id, usuario_id) {
  const { rows: [treinoAluno] } = await pool.query(
    `INSERT INTO treino_alunos (treino_id, usuario_id) VALUES ($1, $2) RETURNING *`,
    [treino_id, usuario_id]
  );
  return treinoAluno;
}

async function criarLead(overrides = {}) {
  const { rows: [lead] } = await pool.query(
    `INSERT INTO leads (nome, telefone, email, objetivo, origem, indicador_id, status_pipeline)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [
      overrides.nome || 'Lead Teste',
      overrides.telefone || '67988887777',
      overrides.email || null,
      overrides.objetivo || null,
      overrides.origem || 'site',
      overrides.indicador_id || null,
      overrides.status_pipeline || 'novo_lead',
    ]
  );
  return lead;
}

module.exports = {
  criarUsuario,
  criarPlano,
  criarMatricula,
  gerarToken,
  criarAula,
  criarExercicio,
  criarTreino,
  criarTreinoExercicio,
  atribuirTreino,
  criarLead,
};
