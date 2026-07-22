const crypto = require('crypto');

const GRAPH_API_VERSION = 'v25.0';

// Valida o header X-Hub-Signature-256 que a Meta envia em todo POST de
// webhook, assinando o corpo bruto com HMAC-SHA256 e o App Secret.
// https://developers.facebook.com/docs/graph-api/webhooks/getting-started#validate-payloads
function validarAssinaturaWebhook(rawBody, signatureHeader) {
  if (!process.env.WHATSAPP_APP_SECRET) {
    throw new Error('WHATSAPP_APP_SECRET não configurado — não é possível validar o webhook');
  }
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) return false;

  const assinaturaRecebida = signatureHeader.slice('sha256='.length);
  const assinaturaEsperada = crypto
    .createHmac('sha256', process.env.WHATSAPP_APP_SECRET)
    .update(rawBody)
    .digest('hex');

  const bufRecebido = Buffer.from(assinaturaRecebida, 'hex');
  const bufEsperado = Buffer.from(assinaturaEsperada, 'hex');
  if (bufRecebido.length !== bufEsperado.length) return false;

  return crypto.timingSafeEqual(bufRecebido, bufEsperado);
}

// Normaliza pra E.164 sem "+" (formato que a Cloud API espera). Assume Brasil
// quando o número não vem com código de país.
function normalizarTelefone(telefone) {
  const digitos = String(telefone).replace(/\D/g, '');
  return digitos.startsWith('55') ? digitos : `55${digitos}`;
}

// Nomes dos Message Templates que precisam existir (e estar aprovados) no
// Meta Business Manager antes de qualquer notificação proativa funcionar de
// verdade. Fora da janela de 24h após o cliente mandar mensagem, a Cloud API
// rejeita texto livre (type: text) — só aceita template aprovado. Texto de
// cada um e passo a passo de cadastro: ver "Backlog - Passos Manuais" no vault.
const TEMPLATES = {
  BOAS_VINDAS: 'teg_boas_vindas',
  LEMBRETE_AUSENCIA: 'teg_lembrete_ausencia',
  LEMBRETE_VENCIMENTO: 'teg_lembrete_vencimento',
  ANIVERSARIO: 'teg_aniversario',
  REATIVACAO: 'teg_reativacao',
  COBRANCA_COM_LINK: 'teg_cobranca_gerada_link',
  COBRANCA_SEM_LINK: 'teg_cobranca_recepcao',
  LEMBRETE_ATRASO: 'teg_lembrete_atraso',
};

async function enviarPayload(telefone, payload) {
  if (!process.env.WHATSAPP_TOKEN || !process.env.WHATSAPP_PHONE_NUMBER_ID) {
    console.log(`[WhatsApp MOCK] → ${telefone}: ${JSON.stringify(payload)}`);
    return;
  }

  const res = await fetch(
    `https://graph.facebook.com/${GRAPH_API_VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }
  );

  if (!res.ok) {
    const erro = await res.text();
    throw new Error(`Falha ao enviar WhatsApp: ${erro}`);
  }
}

// Texto livre — só vale dentro da janela de 24h após o cliente mandar
// mensagem (uso: respostas da IA a leads que acabaram de escrever pra gente).
async function enviar(telefone, mensagem) {
  await enviarPayload(telefone, {
    messaging_product: 'whatsapp',
    to: normalizarTelefone(telefone),
    type: 'text',
    text: { body: mensagem },
  });
}

// Message Template aprovado — obrigatório pra qualquer mensagem que a gente
// inicia (fora da janela de 24h). Parâmetros preenchem as variáveis {{1}},
// {{2}}... do corpo do template, na ordem.
async function enviarTemplate(telefone, nomeTemplate, parametros = []) {
  await enviarPayload(telefone, {
    messaging_product: 'whatsapp',
    to: normalizarTelefone(telefone),
    type: 'template',
    template: {
      name: nomeTemplate,
      language: { code: 'pt_BR' },
      components: parametros.length
        ? [{ type: 'body', parameters: parametros.map((texto) => ({ type: 'text', text: String(texto) })) }]
        : [],
    },
  });
}

async function enviarBoasVindas(telefone, nome, plano) {
  await enviarTemplate(telefone, TEMPLATES.BOAS_VINDAS, [nome, plano]);
}

async function enviarLembreteAusencia(telefone, nome, dias) {
  await enviarTemplate(telefone, TEMPLATES.LEMBRETE_AUSENCIA, [nome, dias]);
}

async function enviarLembreteVencimento(telefone, nome, diasRestantes) {
  await enviarTemplate(telefone, TEMPLATES.LEMBRETE_VENCIMENTO, [nome, diasRestantes]);
}

async function enviarPaizens(telefone, nome) {
  await enviarTemplate(telefone, TEMPLATES.ANIVERSARIO, [nome]);
}

async function enviarReativacao(telefone, nome) {
  await enviarTemplate(telefone, TEMPLATES.REATIVACAO, [nome]);
}

async function enviarCobrancaGerada(telefone, nome, linkPagamento) {
  if (linkPagamento) {
    await enviarTemplate(telefone, TEMPLATES.COBRANCA_COM_LINK, [nome, linkPagamento]);
  } else {
    await enviarTemplate(telefone, TEMPLATES.COBRANCA_SEM_LINK, [nome]);
  }
}

async function enviarLembreteAtraso(telefone, nome, diasAtraso) {
  await enviarTemplate(telefone, TEMPLATES.LEMBRETE_ATRASO, [nome, diasAtraso]);
}

module.exports = {
  enviar,
  enviarTemplate,
  enviarBoasVindas,
  enviarLembreteAusencia,
  enviarLembreteVencimento,
  enviarPaizens,
  enviarReativacao,
  normalizarTelefone,
  enviarCobrancaGerada,
  enviarLembreteAtraso,
  validarAssinaturaWebhook,
  TEMPLATES,
};
