const pool = require('../config/db');

const XP_POR_MOTIVO = {
  treino: 50,
  sequencia_7d: 200,
  sequencia_30d: 1000,
  indicacao: 200,
  conquista: 0,
  matricula: 100,
};

async function adicionarXP(usuario_id, pontos, motivo) {
  await pool.query('INSERT INTO xp_log (usuario_id, pontos, motivo) VALUES ($1, $2, $3)', [usuario_id, pontos, motivo]);
  await pool.query('UPDATE usuarios SET xp = xp + $1, updated_at = NOW() WHERE id = $2', [pontos, usuario_id]);
  await verificarConquistas(usuario_id);
}

async function atualizarSequencia(usuario_id) {
  const { rows } = await pool.query(
    `SELECT data FROM frequencias WHERE usuario_id = $1 ORDER BY data DESC LIMIT 31`,
    [usuario_id]
  );

  let sequencia = 0;
  let dataAtual = new Date();
  dataAtual.setHours(0, 0, 0, 0);

  for (const row of rows) {
    const dataFreq = new Date(row.data);
    dataFreq.setHours(0, 0, 0, 0);
    const diff = Math.round((dataAtual - dataFreq) / (1000 * 60 * 60 * 24));
    if (diff === sequencia) {
      sequencia++;
    } else {
      break;
    }
  }

  await pool.query(
    `UPDATE usuarios SET
       sequencia_atual = $1,
       maior_sequencia = GREATEST(maior_sequencia, $1),
       updated_at = NOW()
     WHERE id = $2`,
    [sequencia, usuario_id]
  );

  if (sequencia === 7) await adicionarXP(usuario_id, XP_POR_MOTIVO.sequencia_7d, 'sequencia_7d');
  if (sequencia === 30) await adicionarXP(usuario_id, XP_POR_MOTIVO.sequencia_30d, 'sequencia_30d');
}

async function verificarConquistas(usuario_id) {
  const [totalTreinos, userRow, totalIndicacoes] = await Promise.all([
    pool.query('SELECT COUNT(*)::int AS total FROM frequencias WHERE usuario_id = $1', [usuario_id]),
    pool.query('SELECT sequencia_atual FROM usuarios WHERE id = $1', [usuario_id]),
    pool.query("SELECT COUNT(*)::int AS total FROM indicacoes WHERE indicador_id = $1 AND status = 'convertido'", [usuario_id]),
  ]);

  const treinos = totalTreinos.rows[0].total;
  const sequencia = userRow.rows[0].sequencia_atual;
  const indicacoes = totalIndicacoes.rows[0].total;

  const { rows: todasConquistas } = await pool.query('SELECT * FROM conquistas');
  const { rows: jaDesbloqueadas } = await pool.query(
    'SELECT conquista_id FROM aluno_conquistas WHERE usuario_id = $1',
    [usuario_id]
  );
  const desbloqueadosIds = new Set(jaDesbloqueadas.map(r => r.conquista_id));

  for (const c of todasConquistas) {
    if (desbloqueadosIds.has(c.id)) continue;

    let atingiu = false;
    if (c.tipo === 'treinos' && treinos >= c.meta) atingiu = true;
    if (c.tipo === 'sequencia' && sequencia >= c.meta) atingiu = true;
    if (c.tipo === 'indicacao' && indicacoes >= c.meta) atingiu = true;

    if (atingiu) {
      await pool.query(
        'INSERT INTO aluno_conquistas (usuario_id, conquista_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
        [usuario_id, c.id]
      );
      if (c.xp_recompensa > 0) {
        await pool.query('INSERT INTO xp_log (usuario_id, pontos, motivo) VALUES ($1, $2, $3)', [usuario_id, c.xp_recompensa, 'conquista']);
        await pool.query('UPDATE usuarios SET xp = xp + $1 WHERE id = $2', [c.xp_recompensa, usuario_id]);
      }
    }
  }
}

module.exports = { adicionarXP, atualizarSequencia, verificarConquistas };
