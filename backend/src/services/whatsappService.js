async function enviar(telefone, mensagem) {
  if (process.env.NODE_ENV !== 'production' || !process.env.WHATSAPP_TOKEN) {
    console.log(`[WhatsApp MOCK] → ${telefone}: ${mensagem}`);
    return;
  }
  // TODO: integrar com Evolution API ou WhatsApp Business Cloud API
  // https://developers.facebook.com/docs/whatsapp/cloud-api/messages/text-messages
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

module.exports = {
  enviar,
  enviarBoasVindas,
  enviarLembreteAusencia,
  enviarLembreteVencimento,
  enviarPaizens,
};
