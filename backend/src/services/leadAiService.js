const Anthropic = require('@anthropic-ai/sdk');
const pool = require('../config/db');
const whatsapp = require('./whatsappService');

const MODEL = 'claude-sonnet-5';
const HISTORICO_MAXIMO = 20;

let client = null;
function getClient() {
  if (!client && process.env.ANTHROPIC_API_KEY) {
    client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return client;
}

async function montarSystemPrompt() {
  const { rows: planos } = await pool.query(
    `SELECT nome, descricao, preco_mensal, duracao_dias FROM planos WHERE ativo = TRUE ORDER BY preco_mensal`
  );

  const planosTexto = planos.length
    ? planos.map((p) =>
        `- ${p.nome} (${p.duracao_dias} dias): R$${Number(p.preco_mensal).toFixed(2)}/mês — ${p.descricao || 'sem observações'}`
      ).join('\n')
    : 'Nenhum plano cadastrado no momento — diga que vai confirmar os valores com a equipe.';

  return `Você é a assistente virtual da Academia TEG, uma academia em Campo Grande - MS. Está respondendo pelo WhatsApp.

Seu objetivo: conversar com pessoas interessadas em se matricular, tirar dúvidas sobre os planos e incentivá-las a agendar uma visita ou se matricular.

Tom de voz: caloroso, direto, natural — como uma conversa de WhatsApp de verdade, nunca formal ou robótico. Frases curtas (no máximo 2-3 por resposta). Pode usar emoji com moderação.

Planos disponíveis agora:
${planosTexto}

Endereço: R. Assunção, 1946 — Vila Morumbi, Campo Grande - MS
Horário de funcionamento: 06h às 23h, todos os dias
Modalidades: musculação, cross training, aulas coletivas (spinning, funcional, zumba, yoga)

Regras importantes:
- NUNCA invente preços, planos ou informações que não estão listadas aqui
- Se não souber algo, diga que vai confirmar com a equipe
- Quando a pessoa demonstrar interesse real em se matricular, mande o link: https://teg-academia.com.br/matricula.html
- Não seja insistente — seja um ajudante simpático, não um vendedor chato`;
}

async function responderLead(lead, mensagemRecebida) {
  const anthropic = getClient();

  await pool.query(
    `INSERT INTO lead_mensagens (lead_id, direcao, texto) VALUES ($1, 'recebida', $2)`,
    [lead.id, mensagemRecebida]
  );

  if (!anthropic) {
    console.log(`[IA WhatsApp MOCK] sem ANTHROPIC_API_KEY — lead ${lead.id} mandou: "${mensagemRecebida}"`);
    return;
  }

  const { rows: historico } = await pool.query(
    `SELECT direcao, texto FROM lead_mensagens WHERE lead_id = $1 ORDER BY created_at ASC LIMIT $2`,
    [lead.id, HISTORICO_MAXIMO]
  );

  const messages = historico.map((m) => ({
    role: m.direcao === 'recebida' ? 'user' : 'assistant',
    content: m.texto,
  }));

  const systemPrompt = await montarSystemPrompt();

  const resposta = await anthropic.messages.create({
    model: MODEL,
    max_tokens: 300,
    system: systemPrompt,
    messages,
  });

  const texto = resposta.content.find((bloco) => bloco.type === 'text')?.text?.trim();
  if (!texto) return;

  await whatsapp.enviar(lead.telefone, texto);

  await pool.query(
    `INSERT INTO lead_mensagens (lead_id, direcao, texto) VALUES ($1, 'enviada', $2)`,
    [lead.id, texto]
  );

  if (lead.status_pipeline === 'novo_lead') {
    await pool.query(
      `UPDATE leads SET status_pipeline = 'contato', updated_at = NOW() WHERE id = $1`,
      [lead.id]
    );
    await pool.query(
      `INSERT INTO pipeline_historico (lead_id, status_anterior, status_novo, observacao)
       VALUES ($1, 'novo_lead', 'contato', 'IA respondeu automaticamente pelo WhatsApp')`,
      [lead.id]
    );
  }
}

module.exports = { responderLead };
