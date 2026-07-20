const pool = require('../config/db');

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

module.exports = { iniciarSessao, treinoAtivoDoAluno };
