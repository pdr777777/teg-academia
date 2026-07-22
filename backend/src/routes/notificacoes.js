const express = require('express');
const crypto = require('crypto');
const pool = require('../config/db');
const { iniciarSessao } = require('./sessoes');
const frequenciaService = require('../services/frequenciaService');

const router = express.Router();

// Comparação em tempo constante — o segredo chega pelo path da URL (o Control
// iD não tem como enviar headers customizados), então merece o mesmo cuidado
// contra timing attack que qualquer outro segredo comparado no backend.
function segredoValido(recebido) {
  const esperado = process.env.CATRACA_WEBHOOK_SECRET;
  if (!esperado || !recebido) return false;
  const bufRecebido = Buffer.from(recebido);
  const bufEsperado = Buffer.from(esperado);
  if (bufRecebido.length !== bufEsperado.length) return false;
  return crypto.timingSafeEqual(bufRecebido, bufEsperado);
}

// O formato exato do payload do evento varia por firmware/versão do Control
// iD e ainda não foi confirmado em produção — tentamos os caminhos mais
// comuns em vez de travar em um único formato.
function extrairControlIdUserId(body) {
  const candidatos = [
    body?.user_id,
    body?.value?.user_id,
    body?.event?.user_id,
    body?.catra_event?.user_id,
    body?.data?.user_id,
  ];
  const encontrado = candidatos.find((v) => v !== undefined && v !== null && v !== '');
  return encontrado != null ? String(encontrado) : null;
}

// POST /api/notifications/catraca/:secret/:eventType
// Callback do Monitor API do Control iD (iDFace MAX). O dispositivo já decide
// sozinho, localmente, se libera a catraca (reconhecimento facial) — esse
// endpoint só recebe o aviso pra iniciar a sessão de treino no app. Se isso
// falhar por qualquer motivo, o aluno ainda entra normalmente na academia,
// só não abre o treino sozinho.
router.post('/catraca/:secret/:eventType', async (req, res) => {
  if (!segredoValido(req.params.secret)) {
    return res.status(401).json({ error: 'Não autorizado' });
  }

  console.log(`[catraca-controlid] evento=${req.params.eventType} payload=${JSON.stringify(req.body)}`);

  if (req.params.eventType !== 'catra_event') {
    return res.status(200).json({ ok: true, ignorado: true });
  }

  try {
    const controlIdUserId = extrairControlIdUserId(req.body);
    if (!controlIdUserId) {
      console.warn('[catraca-controlid] não encontrou user_id no payload, ver log acima');
      return res.status(200).json({ ok: true, aviso: 'user_id não encontrado no payload' });
    }

    const { rows: [usuario] } = await pool.query(
      'SELECT id FROM usuarios WHERE controlid_user_id = $1',
      [controlIdUserId]
    );
    if (!usuario) {
      console.warn(`[catraca-controlid] nenhum aluno mapeado para controlid_user_id=${controlIdUserId}`);
      return res.status(200).json({ ok: true, aviso: 'aluno não mapeado' });
    }

    try {
      await iniciarSessao(usuario.id, null, 'catraca');
    } catch (err) {
      // Sem treino atribuído é esperado (caso comum) — só não ganha o
      // auto-início de sessão. Não pode abortar o try externo, senão o
      // aluno sem treino nunca teria frequência registrada via catraca.
      console.warn('[catraca-controlid] iniciarSessao não iniciou sessão automática', { usuarioId: usuario.id, erro: err.message });
    }

    await frequenciaService.registrarCheckin(usuario.id, 'catraca');
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[catraca-controlid] erro ao registrar acesso', err);
    res.status(200).json({ ok: false });
  }
});

module.exports = router;
