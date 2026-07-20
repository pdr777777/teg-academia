const crypto = require('crypto');
const pool = require('../config/db');
const { catracasConfiguradas } = require('./catraca/config');

const GRUPO_NOME = 'TEG-ativos';
const REGRA_NOME = 'TEG-liberado';
const HORARIO_NOME = 'TEG-sempre';

async function garantirGrupo(client) {
  const existentes = await client.loadObjects('groups', { fields: ['id', 'name'], where: { groups: { name: GRUPO_NOME } } });
  if (existentes[0]) return existentes[0].id;
  const [id] = await client.createObjects('groups', [{ name: GRUPO_NOME }]);
  return id;
}

async function garantirRegraDeAcesso(client) {
  const existentes = await client.loadObjects('access_rules', { fields: ['id', 'name'], where: { access_rules: { name: REGRA_NOME } } });
  if (existentes[0]) return existentes[0].id;
  const [id] = await client.createObjects('access_rules', [{ name: REGRA_NOME, type: 1, priority: 0 }]);
  return id;
}

async function garantirHorarioIrrestrito(client) {
  const existentes = await client.loadObjects('time_zones', { fields: ['id', 'name'], where: { time_zones: { name: HORARIO_NOME } } });
  if (existentes[0]) return existentes[0].id;

  const [timeZoneId] = await client.createObjects('time_zones', [{ name: HORARIO_NOME }]);
  await client.createObjects('time_spans', [{
    time_zone_id: timeZoneId, start: 0, end: 86399,
    sun: 1, mon: 1, tue: 1, wed: 1, thu: 1, fri: 1, sat: 1, hol1: 1, hol2: 1, hol3: 1,
  }]);
  return timeZoneId;
}

async function garantirVinculo(client, object, campos) {
  const existentes = await client.loadObjects(object, { fields: Object.keys(campos), where: { [object]: campos } });
  if (existentes[0]) return;
  await client.createObjects(object, [campos]);
}

async function garantirEstruturaBase(client) {
  const grupoId = await garantirGrupo(client);
  const regraId = await garantirRegraDeAcesso(client);
  const timeZoneId = await garantirHorarioIrrestrito(client);

  await garantirVinculo(client, 'access_rule_time_zones', { access_rule_id: regraId, time_zone_id: timeZoneId });
  await garantirVinculo(client, 'group_access_rules', { group_id: grupoId, access_rule_id: regraId });

  const portais = await client.loadObjects('portals', { fields: ['id'] });
  for (const portal of portais) {
    await garantirVinculo(client, 'portal_access_rules', { portal_id: portal.id, access_rule_id: regraId });
  }

  return grupoId;
}

async function sincronizarAluno(usuarioId) {
  const { rows: [aluno] } = await pool.query('SELECT id, nome, foto_url FROM usuarios WHERE id = $1', [usuarioId]);
  if (!aluno) throw new Error(`Usuário ${usuarioId} não encontrado`);

  for (const client of catracasConfiguradas()) {
    await garantirEstruturaBase(client);

    const { rows: [mapeamento] } = await pool.query(
      'SELECT * FROM catraca_usuarios WHERE usuario_id = $1 AND catraca = $2',
      [usuarioId, client.nome]
    );

    let catracaUserId = mapeamento?.catraca_user_id;
    if (!catracaUserId) {
      const [id] = await client.createObjects('users', [{
        registration: `TEG-${usuarioId}`,
        name: aluno.nome,
        password: crypto.randomBytes(8).toString('hex'),
      }]);
      catracaUserId = id;
    }

    let faceStatus = mapeamento?.face_status || 'pendente_presencial';
    if (aluno.foto_url && faceStatus !== 'sincronizado') {
      try {
        const resposta = await fetch(aluno.foto_url);
        const buffer = Buffer.from(await resposta.arrayBuffer());
        await client.setUserImage(catracaUserId, buffer);
        faceStatus = 'sincronizado';
      } catch {
        faceStatus = 'pendente_presencial';
      }
    }

    await pool.query(
      `INSERT INTO catraca_usuarios (usuario_id, catraca, catraca_user_id, face_status)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (usuario_id, catraca) DO UPDATE SET
         catraca_user_id = EXCLUDED.catraca_user_id, face_status = EXCLUDED.face_status, updated_at = NOW()`,
      [usuarioId, client.nome, catracaUserId, faceStatus]
    );
  }
}

module.exports = {
  garantirGrupo,
  garantirEstruturaBase,
  sincronizarAluno,
};
