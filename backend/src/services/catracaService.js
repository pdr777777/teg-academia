const crypto = require('crypto');
const pool = require('../config/db');
const { catracasConfiguradas } = require('./catraca/config');
const logger = require('../utils/logger');
const sessaoService = require('./sessaoService');
const frequenciaService = require('./frequenciaService');

const GRUPO_NOME = 'TEG-ativos';
const REGRA_NOME = 'TEG-liberado';
const HORARIO_NOME = 'TEG-sempre';

// Fotos são payloads maiores que as chamadas JSON da API (5s no controlIdClient);
// dá mais orçamento pro download da foto do host externo antes de abortar.
const FOTO_TIMEOUT_MS = 15000;

// Kill switch global: com configuracoes.catraca_ativa = false toda a integração
// vira no-op sem redeploy. Gate na fronteira do serviço garante que qualquer
// caller — atual ou futuro — respeite o flag sem precisar checar por conta própria.
async function estaAtiva() {
  const { rows: [{ catraca_ativa }] } = await pool.query('SELECT catraca_ativa FROM configuracoes WHERE id = 1');
  return catraca_ativa;
}

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
  if (!(await estaAtiva())) return;

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
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), FOTO_TIMEOUT_MS);
        let buffer;
        try {
          const resposta = await fetch(aluno.foto_url, { signal: controller.signal });
          buffer = Buffer.from(await resposta.arrayBuffer());
        } finally {
          clearTimeout(timeoutId);
        }
        await client.setUserImage(catracaUserId, buffer);
        faceStatus = 'sincronizado';
      } catch (err) {
        logger.error('catraca.setUserImage falhou', { usuarioId, catraca: client.nome, erro: err.message });
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

async function liberarAcesso(usuarioId) {
  if (!(await estaAtiva())) return;

  for (const client of catracasConfiguradas()) {
    const { rows: [mapeamento] } = await pool.query(
      'SELECT catraca_user_id FROM catraca_usuarios WHERE usuario_id = $1 AND catraca = $2',
      [usuarioId, client.nome]
    );
    if (!mapeamento) continue;

    const grupoId = await garantirGrupo(client);
    await garantirVinculo(client, 'user_groups', { user_id: mapeamento.catraca_user_id, group_id: grupoId });
    await pool.query(
      'UPDATE catraca_usuarios SET grupo_ativo = TRUE, updated_at = NOW() WHERE usuario_id = $1 AND catraca = $2',
      [usuarioId, client.nome]
    );
  }
}

async function bloquearAcesso(usuarioId) {
  if (!(await estaAtiva())) return;

  for (const client of catracasConfiguradas()) {
    const { rows: [mapeamento] } = await pool.query(
      'SELECT catraca_user_id FROM catraca_usuarios WHERE usuario_id = $1 AND catraca = $2',
      [usuarioId, client.nome]
    );
    if (!mapeamento) continue;

    const grupoId = await garantirGrupo(client);
    await client.destroyObjects('user_groups', { user_id: mapeamento.catraca_user_id, group_id: grupoId });
    await pool.query(
      'UPDATE catraca_usuarios SET grupo_ativo = FALSE, updated_at = NOW() WHERE usuario_id = $1 AND catraca = $2',
      [usuarioId, client.nome]
    );
  }
}

function tipoDoEvento(event) {
  if (event === 7) return 'autorizado';
  if (event === 6) return 'negado';
  return 'nao_identificado';
}

async function processarEvento(client, evento) {
  const { rows: [mapeamento] } = await pool.query(
    'SELECT usuario_id FROM catraca_usuarios WHERE catraca = $1 AND catraca_user_id = $2',
    [client.nome, evento.user_id]
  );

  const tipo = tipoDoEvento(evento.event);
  await pool.query(
    `INSERT INTO catraca_eventos (usuario_id, catraca, tipo, criado_em) VALUES ($1, $2, $3, to_timestamp($4))`,
    [mapeamento?.usuario_id || null, client.nome, tipo, evento.time]
  );

  if (!mapeamento || tipo !== 'autorizado') return;

  try {
    await sessaoService.iniciarSessao(mapeamento.usuario_id, null, 'catraca');
  } catch (err) {
    // Sem treino atribuído é esperado — só não ganha o auto-início de sessão.
    logger.warn('catraca.iniciarSessao não iniciou sessão automática', { usuarioId: mapeamento.usuario_id, erro: err.message });
  }

  await frequenciaService.registrarCheckin(mapeamento.usuario_id, 'catraca');
}

async function processarNovosAcessos() {
  for (const client of catracasConfiguradas()) {
    try {
      const { rows: [cursorRow] } = await pool.query(
        'SELECT ultimo_evento_id FROM catraca_cursor WHERE catraca = $1',
        [client.nome]
      );
      const cursor = cursorRow?.ultimo_evento_id || 0;

      const eventos = await client.loadObjects('access_logs', {
        fields: ['id', 'time', 'event', 'user_id'],
        where: { access_logs: { id: { '>': cursor } } },
        order: ['id', 'ascending'],
        limit: 200,
      });

      let maiorId = cursor;
      for (const evento of eventos) {
        maiorId = Math.max(maiorId, evento.id);
        await processarEvento(client, evento);
      }

      if (eventos.length) {
        await pool.query(
          `INSERT INTO catraca_cursor (catraca, ultimo_evento_id) VALUES ($1, $2)
           ON CONFLICT (catraca) DO UPDATE SET ultimo_evento_id = $2`,
          [client.nome, maiorId]
        );
      }
    } catch (err) {
      logger.error('catraca.processarNovosAcessos falhou', { catraca: client.nome, erro: err.message });
    }
  }
}

async function verificarSaude() {
  const resultados = [];
  for (const client of catracasConfiguradas()) {
    try {
      await client.login();
      resultados.push({ catraca: client.nome, online: true });
    } catch {
      resultados.push({ catraca: client.nome, online: false });
    }
  }
  return resultados;
}

async function reconciliar() {
  for (const client of catracasConfiguradas()) {
    try {
      // "Deveria ter acesso" tem que casar com o que processarVencimentos trata
      // como bloqueável: só 'suspensa'/'cancelada' perdem acesso. 'vencida' está
      // no período de tolerância (grupo_ativo herdado) e mantém acesso até virar
      // 'suspensa' — por isso IN ('ativa', 'vencida') e não só 'ativa'.
      const { rows: mapeamentos } = await pool.query(
        `SELECT cu.usuario_id, cu.catraca_user_id, cu.grupo_ativo,
                EXISTS (SELECT 1 FROM matriculas m WHERE m.usuario_id = cu.usuario_id AND m.status IN ('ativa', 'vencida')) AS deveria_estar_ativo
         FROM catraca_usuarios cu WHERE cu.catraca = $1`,
        [client.nome]
      );

      for (const mapeamento of mapeamentos) {
        const encontrados = await client.loadObjects('users', {
          fields: ['id'],
          where: { users: { id: mapeamento.catraca_user_id } },
        });
        if (!encontrados.length) {
          // Usuário sumiu da catraca (reset de fábrica, exclusão manual etc.) — recria do zero.
          await pool.query(
            'DELETE FROM catraca_usuarios WHERE usuario_id = $1 AND catraca = $2',
            [mapeamento.usuario_id, client.nome]
          );
          await sincronizarAluno(mapeamento.usuario_id);
          if (mapeamento.deveria_estar_ativo) await liberarAcesso(mapeamento.usuario_id);
          continue;
        }

        // Corrige drift entre grupo_ativo e o status real da matrícula — cobre o
        // caso de liberarAcesso/bloquearAcesso ter falhado antes por rede e
        // nunca ter sido reprocessado (não há fila de retry pra esses dois).
        if (mapeamento.deveria_estar_ativo && !mapeamento.grupo_ativo) {
          await liberarAcesso(mapeamento.usuario_id);
        } else if (!mapeamento.deveria_estar_ativo && mapeamento.grupo_ativo) {
          await bloquearAcesso(mapeamento.usuario_id);
        }
      }
    } catch (err) {
      logger.error('catraca.reconciliar falhou', { catraca: client.nome, erro: err.message });
    }
  }
}

module.exports = {
  estaAtiva,
  garantirGrupo,
  garantirEstruturaBase,
  sincronizarAluno,
  liberarAcesso,
  bloquearAcesso,
  processarNovosAcessos,
  verificarSaude,
  reconciliar,
};
