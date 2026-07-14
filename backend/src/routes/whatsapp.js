const express = require('express');
const pool = require('../config/db');
const whatsapp = require('../services/whatsappService');
const leadAiService = require('../services/leadAiService');

const router = express.Router();

// GET /api/whatsapp/webhook — handshake de verificação da Meta ao configurar o webhook
router.get('/webhook', (req, res) => {
  const modo = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const desafio = req.query['hub.challenge'];

  if (modo === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return res.status(200).send(desafio);
  }
  res.sendStatus(403);
});

async function encontrarUsuarioPorTelefone(telefone) {
  const digitos = whatsapp.normalizarTelefone(telefone).slice(-10);
  const { rows: [usuario] } = await pool.query(
    `SELECT id FROM usuarios WHERE RIGHT(regexp_replace(telefone, '\\D', '', 'g'), 10) = $1`,
    [digitos]
  );
  return usuario || null;
}

async function encontrarOuCriarLead(telefone, nomeContato) {
  const digitos = whatsapp.normalizarTelefone(telefone).slice(-10);
  const { rows: [existente] } = await pool.query(
    `SELECT * FROM leads WHERE RIGHT(regexp_replace(telefone, '\\D', '', 'g'), 10) = $1
     ORDER BY created_at DESC LIMIT 1`,
    [digitos]
  );
  if (existente) return existente;

  const { rows: [novo] } = await pool.query(
    `INSERT INTO leads (nome, telefone, origem) VALUES ($1, $2, 'whatsapp') RETURNING *`,
    [nomeContato || 'Contato WhatsApp', telefone]
  );
  await pool.query(`INSERT INTO pipeline_historico (lead_id, status_novo) VALUES ($1, 'novo_lead')`, [novo.id]);
  return novo;
}

// POST /api/whatsapp/webhook — mensagens recebidas. Responde 200 rápido pra
// Meta (exige ack em poucos segundos) e processa a IA depois, sem bloquear.
router.post('/webhook', (req, res) => {
  try {
    const assinaturaValida = whatsapp.validarAssinaturaWebhook(
      req.rawBody,
      req.headers['x-hub-signature-256']
    );
    if (!assinaturaValida) return res.sendStatus(401);
  } catch (err) {
    console.error('[WhatsApp webhook] falha ao validar assinatura:', err.message);
    return res.sendStatus(500);
  }

  res.sendStatus(200);

  const message = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (!message || message.type !== 'text') return;

  const nomeContato = req.body.entry?.[0]?.changes?.[0]?.value?.contacts?.[0]?.profile?.name;
  processarMensagem(message.from, message.text.body, nomeContato).catch((err) => {
    console.error('[WhatsApp webhook] erro ao processar mensagem:', err.message);
  });
});

async function processarMensagem(telefone, texto, nomeContato) {
  // A IA aqui é só pra leads novos — aluno/staff já cadastrado não entra nesse fluxo
  const usuarioExistente = await encontrarUsuarioPorTelefone(telefone);
  if (usuarioExistente) return;

  const lead = await encontrarOuCriarLead(telefone, nomeContato);
  await leadAiService.responderLead(lead, texto);
}

module.exports = router;
