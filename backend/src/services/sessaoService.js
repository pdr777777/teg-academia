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

async function treinoPertenceAoAluno(usuario_id, treino_id) {
  const { rows: [vinculo] } = await pool.query(
    `SELECT 1 FROM treino_alunos WHERE usuario_id = $1 AND treino_id = $2 AND ativo = TRUE`,
    [usuario_id, treino_id]
  );
  return !!vinculo;
}

async function iniciarSessao(usuario_id, treino_id, origem) {
  let treinoId = treino_id;
  if (treinoId) {
    // treino_id explícito (fluxo manual, aluno escolhe no app) tem que ser
    // conferido — sem isso, um aluno consegue iniciar sessão (e ganhar XP)
    // em cima do treino de outra pessoa só adivinhando/enumerando o id.
    if (!(await treinoPertenceAoAluno(usuario_id, treinoId))) {
      const err = new Error('Treino não atribuído a este aluno');
      err.status = 403;
      throw err;
    }
  } else {
    treinoId = await treinoAtivoDoAluno(usuario_id);
  }
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
