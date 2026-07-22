const pool = require('../config/db');

async function treinoAtivoDoAluno(usuario_id) {
  // Com grade semanal (dia_semana por treino_aluno), o aluno pode ter mais de
  // uma linha ativa — prioriza o treino do dia de hoje, cai pro "todo dia"
  // (dia_semana NULL) se não houver um específico pra hoje.
  const hoje = new Date().getDay();
  const { rows: [treino] } = await pool.query(
    `SELECT t.id FROM treino_alunos ta JOIN treinos t ON t.id = ta.treino_id
     WHERE ta.usuario_id = $1 AND ta.ativo = TRUE
     ORDER BY (ta.dia_semana = $2) DESC, ta.dia_semana NULLS LAST
     LIMIT 1`,
    [usuario_id, hoje]
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
