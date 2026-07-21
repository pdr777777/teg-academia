const pool = require('../config/db');
const xpService = require('./xpService');

async function registrarCheckin(usuarioId, origem = 'app') {
  const hoje = new Date().toISOString().split('T')[0];

  const { rows: existing } = await pool.query(
    'SELECT id FROM frequencias WHERE usuario_id = $1 AND data = $2',
    [usuarioId, hoje]
  );
  if (existing[0]) return null;

  const { rows: [freq] } = await pool.query(
    'INSERT INTO frequencias (usuario_id, data) VALUES ($1, $2) RETURNING *',
    [usuarioId, hoje]
  );

  await xpService.adicionarXP(usuarioId, 50, 'treino');
  await xpService.atualizarSequencia(usuarioId);

  return freq;
}

module.exports = { registrarCheckin };
