const crypto = require('crypto');

const GRAPH_API_VERSION = 'v21.0';

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

async function enviar(telefone, mensagem) {
  if (!process.env.WHATSAPP_TOKEN || !process.env.WHATSAPP_PHONE_NUMBER_ID) {
    console.log(`[WhatsApp MOCK] → ${telefone}: ${mensagem}`);
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
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: normalizarTelefone(telefone),
        type: 'text',
        text: { body: mensagem },
      }),
    }
  );

  if (!res.ok) {
    const erro = await res.text();
    throw new Error(`Falha ao enviar WhatsApp: ${erro}`);
  }
}

async function enviarBoasVindas(telefone, nome, plano) {
  await enviar(telefone,
    `Olá ${nome}! 🎉 Seja bem-vindo(a) à academia!\n` +
    `Seu plano *${plano}* foi ativado com sucesso.\n` +
    `Estamos te esperando! 💪`
  );
}

async function enviarLembreteAusencia(telefone, nome, dias) {
  await enviar(telefone,
    `Ei ${nome}, sentimos sua falta! 😢\n` +
    `Faz ${dias} dias que você não aparece por aqui.\n` +
    `Que tal voltar hoje? Seu corpo agradece! 💪`
  );
}

async function enviarLembreteVencimento(telefone, nome, diasRestantes) {
  await enviar(telefone,
    `Olá ${nome}! 📅\n` +
    `Seu plano vence em *${diasRestantes} dia(s)*.\n` +
    `Renove agora e continue sua sequência! 🔥`
  );
}

async function enviarPaizens(telefone, nome) {
  await enviar(telefone,
    `Feliz aniversário, ${nome}! 🎂🎉\n` +
    `A academia inteira torce por você.\n` +
    `Apareça hoje para uma aula especial! 🎁`
  );
}

async function enviarReativacao(telefone, nome) {
  await enviar(telefone,
    `Ei ${nome}, tá com saudade da gente? 🥺\n` +
    `Faz um tempo que você não treina e sentimos sua falta por aqui!\n` +
    `Preparamos um presente pra você voltar: *R$10 de desconto* na sua próxima mensalidade. 🎁\n` +
    `Bora retomar? É só chamar a gente aqui no WhatsApp!`
  );
}

async function enviarCobrancaGerada(telefone, nome, linkPagamento) {
  await enviar(telefone,
    linkPagamento
      ? `Olá ${nome}! 💳\nSua próxima cobrança já está disponível:\n${linkPagamento}\n\nPague para continuar treinando sem interrupção!`
      : `Olá ${nome}! 💳\nSua próxima cobrança foi gerada. Procure a recepção da academia para regularizar.`
  );
}

async function enviarLembreteAtraso(telefone, nome, diasAtraso) {
  await enviar(telefone,
    `Olá ${nome}! ⚠️\nSeu pagamento está atrasado há *${diasAtraso} dia(s)*.\n` +
    `Regularize o quanto antes para não perder o acesso aos treinos e aulas.`
  );
}

module.exports = {
  enviar,
  enviarBoasVindas,
  enviarLembreteAusencia,
  enviarLembreteVencimento,
  enviarPaizens,
  enviarReativacao,
  normalizarTelefone,
  enviarCobrancaGerada,
  enviarLembreteAtraso,
  validarAssinaturaWebhook,
};
